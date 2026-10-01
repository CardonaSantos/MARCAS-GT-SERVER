import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  DispatchConcurrentModificationError,
  DispatchIdempotencyConflictError,
  DispatchInvalidStateError,
  DispatchOperationConflictError,
  DispatchOperationNotFoundError,
  DispatchQuantityExceededError,
} from '../../../domain/errors/dispatch.errors';
import {
  DispatchNetReservationLine,
  DispatchOperationRepositoryPort,
  PreparedDispatchOperation,
  PrepareDispatchOperationCommand,
} from '../../../domain/ports/dispatch-operation.repository.port';
import {
  DispatchOperationState,
  DispatchOperationType,
  DispatchState,
} from '../../../dispatch.types';

type OperationRow = Awaited<
  ReturnType<PrismaService['operacionDespacho']['findUnique']>
>;

@Injectable()
export class DispatchOperationPrismaRepository
  implements DispatchOperationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    command: PrepareDispatchOperationCommand,
  ): Promise<PreparedDispatchOperation> {
    const key = command.claveIdempotencia.trim();

    const existing = await this.findByIdempotencyKey(key);
    if (existing) {
      this.assertSamePreparedCommand(existing, command);
      return { ...existing, repeated: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.ordenDespacho.findUnique({
        where: { id: command.ordenDespachoId },
        include: {
          pedido: { select: { id: true, empresaId: true } },
          detalles: true,
        },
      });

      if (!dispatch) {
        throw new DispatchOperationConflictError({
          ordenDespachoId: command.ordenDespachoId,
          reason: 'La orden de despacho no existe.',
        });
      }

      const byId = new Map(
        dispatch.detalles.map((detail) => [detail.id, detail]),
      );
      const seen = new Set<number>();

      for (const line of command.detalles) {
        if (seen.has(line.ordenDespachoDetalleId)) {
          throw new DispatchOperationConflictError({
            ordenDespachoDetalleId: line.ordenDespachoDetalleId,
            reason: 'La operación contiene una línea repetida.',
          });
        }
        seen.add(line.ordenDespachoDetalleId);

        if (!byId.has(line.ordenDespachoDetalleId)) {
          throw new DispatchOperationConflictError({
            ordenDespachoDetalleId: line.ordenDespachoDetalleId,
            reason: 'La línea no pertenece al despacho.',
          });
        }

        if (!Number.isInteger(line.cantidad) || line.cantidad <= 0) {
          throw new DispatchOperationConflictError({
            ordenDespachoDetalleId: line.ordenDespachoDetalleId,
            cantidad: line.cantidad,
          });
        }
      }

      let created;
      try {
        created = await tx.operacionDespacho.create({
          data: {
            ordenDespachoId: command.ordenDespachoId,
            usuarioId: command.usuarioId,
            tipo: command.tipo,
            estado: 'PENDIENTE',
            claveIdempotencia: key,
            observaciones: normalize(command.observaciones),
            ocurridaEn: command.ocurridaEn ?? new Date(),
          },
        });

        await tx.operacionDespachoDetalle.createMany({
          data: command.detalles.map((line) => ({
            operacionId: created.id,
            ordenDespachoDetalleId: line.ordenDespachoDetalleId,
            cantidad: line.cantidad,
            estado: 'PENDIENTE',
            claveIdempotencia: `${key}:DET:${line.ordenDespachoDetalleId}`,
          })),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const repeated = await this.hydrateByKey(tx, key, true);
          if (repeated) {
            this.assertSamePreparedCommand(repeated, command);
            return repeated;
          }
        }
        throw error;
      }

      const hydrated = await this.hydrate(tx, created.id, false);
      if (!hydrated) {
        throw new DispatchOperationConflictError({
          operationId: created.id,
          reason: 'No fue posible recargar la operación creada.',
        });
      }
      return hydrated;
    });
  }

  findById(id: number): Promise<PreparedDispatchOperation | null> {
    return this.hydrate(this.prisma, id, false);
  }

  findByIdempotencyKey(
    key: string,
  ): Promise<PreparedDispatchOperation | null> {
    return this.hydrateByKey(this.prisma, key.trim(), true);
  }

  async beginAttempt(id: number): Promise<PreparedDispatchOperation> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.operacionDespacho.findUnique({
        where: { id },
      });

      if (!current) throw new DispatchOperationNotFoundError(id);

      if (current.estado === 'APLICADA') {
        const applied = await this.hydrate(tx, id, true);
        if (!applied) throw new DispatchOperationNotFoundError(id);
        return applied;
      }

      if (
        current.estado === 'APLICANDO' &&
        current.ultimoIntentoEn &&
        Date.now() - current.ultimoIntentoEn.getTime() < 120_000
      ) {
        throw new DispatchOperationConflictError({
          operationId: id,
          reason: 'La operación ya está siendo procesada.',
        });
      }

      const now = new Date();
      const changed = await tx.operacionDespacho.updateMany({
        where: {
          id,
          version: current.version,
          estado: { in: ['PENDIENTE', 'APLICANDO', 'FALLIDA'] },
        },
        data: {
          estado: 'APLICANDO',
          iniciadaEn: current.iniciadaEn ?? now,
          ultimoIntentoEn: now,
          intentos: { increment: 1 },
          errorAplicacion: null,
          fallidaEn: null,
          version: { increment: 1 },
        },
      });

      if (changed.count !== 1) {
        throw new DispatchConcurrentModificationError({
          operationId: id,
        });
      }

      const hydrated = await this.hydrate(tx, id, false);
      if (!hydrated) throw new DispatchOperationNotFoundError(id);
      return hydrated;
    });
  }

  async recordInventoryResult(
    lineId: number,
    reservaInventarioId: number,
    movimientoInventarioId: number,
  ): Promise<void> {
    const current =
      await this.prisma.operacionDespachoDetalle.findUnique({
        where: { id: lineId },
      });

    if (!current) {
      throw new DispatchOperationConflictError({ lineId });
    }

    if (
      current.reservaInventarioId != null &&
      current.reservaInventarioId !== reservaInventarioId
    ) {
      throw new DispatchOperationConflictError({
        lineId,
        existingReservationId: current.reservaInventarioId,
        reservationId: reservaInventarioId,
      });
    }

    if (
      current.movimientoInventarioId != null &&
      current.movimientoInventarioId !== movimientoInventarioId
    ) {
      throw new DispatchOperationConflictError({
        lineId,
        existingMovementId: current.movimientoInventarioId,
        movementId: movimientoInventarioId,
      });
    }

    await this.prisma.operacionDespachoDetalle.update({
      where: { id: lineId },
      data: { reservaInventarioId, movimientoInventarioId },
    });
  }

  async markLineApplied(lineId: number): Promise<void> {
    await this.prisma.operacionDespachoDetalle.update({
      where: { id: lineId },
      data: {
        estado: 'APLICADA',
        aplicadaEn: new Date(),
        errorAplicacion: null,
      },
    });
  }

  async commitDispatchLine(
    lineId: number,
    actorId: number,
    occurredAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const line =
          await tx.operacionDespachoDetalle.findUnique({
            where: { id: lineId },
          });

        if (!line) {
          throw new DispatchOperationConflictError({ lineId });
        }
        if (line.estado === 'APLICADA') return;

        if (
          line.reservaInventarioId == null ||
          line.movimientoInventarioId == null
        ) {
          throw new DispatchOperationConflictError({
            lineId,
            reason:
              'La línea no tiene resultado de Inventario persistido.',
          });
        }

        const operation = await tx.operacionDespacho.findUnique({
          where: { id: line.operacionId },
        });

        if (!operation) {
          throw new DispatchOperationConflictError({
            lineId,
            operationId: line.operacionId,
          });
        }

        const dispatch = await tx.ordenDespacho.findUnique({
          where: { id: operation.ordenDespachoId },
          include: { detalles: true },
        });

        if (!dispatch) {
          throw new DispatchOperationConflictError({
            ordenDespachoId: operation.ordenDespachoId,
          });
        }

        if (
          !['PREPARADA', 'PARCIALMENTE_DESPACHADA'].includes(
            dispatch.estado,
          )
        ) {
          throw new DispatchInvalidStateError(
            dispatch.estado,
            'confirmar línea despachada',
          );
        }

        const detail =
          await tx.ordenDespachoDetalle.findUnique({
            where: { id: line.ordenDespachoDetalleId },
          });

        if (
          !detail ||
          detail.ordenDespachoId !== dispatch.id
        ) {
          throw new DispatchOperationConflictError({
            lineId,
            ordenDespachoDetalleId:
              line.ordenDespachoDetalleId,
          });
        }

        const next =
          detail.cantidadDespachada + line.cantidad;

        if (
          next > detail.cantidadPreparada ||
          next > detail.cantidadProgramada
        ) {
          throw new DispatchQuantityExceededError({
            ordenDespachoDetalleId: detail.id,
            cantidadActual: detail.cantidadDespachada,
            cantidadOperacion: line.cantidad,
            cantidadPreparada: detail.cantidadPreparada,
            cantidadProgramada: detail.cantidadProgramada,
          });
        }

        const detailChanged =
          await tx.ordenDespachoDetalle.updateMany({
            where: {
              id: detail.id,
              version: detail.version,
            },
            data: {
              cantidadDespachada: next,
              version: { increment: 1 },
            },
          });

        if (detailChanged.count !== 1) {
          throw new DispatchConcurrentModificationError({
            ordenDespachoDetalleId: detail.id,
          });
        }

        const complete = dispatch.detalles.every((item) => {
          const dispatched =
            item.id === detail.id
              ? next
              : item.cantidadDespachada;
          return dispatched === item.cantidadProgramada;
        });

        const parentChanged =
          await tx.ordenDespacho.updateMany({
            where: {
              id: dispatch.id,
              version: dispatch.version,
            },
            data: {
              estado: complete
                ? 'DESPACHADA'
                : 'PARCIALMENTE_DESPACHADA',
              despachadoPorId: actorId,
              ...(complete
                ? { despachadoEn: occurredAt }
                : {}),
              version: { increment: 1 },
            },
          });

        if (parentChanged.count !== 1) {
          throw new DispatchConcurrentModificationError({
            ordenDespachoId: dispatch.id,
          });
        }

        await tx.operacionDespachoDetalle.update({
          where: { id: line.id },
          data: {
            estado: 'APLICADA',
            aplicadaEn: new Date(),
            errorAplicacion: null,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async markLineFailed(
    lineId: number,
    error: string,
  ): Promise<void> {
    await this.prisma.operacionDespachoDetalle.update({
      where: { id: lineId },
      data: {
        estado: 'FALLIDA',
        errorAplicacion: safeError(error),
      },
    });
  }

  async markOperationApplied(id: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const pending =
        await tx.operacionDespachoDetalle.count({
          where: {
            operacionId: id,
            estado: { not: 'APLICADA' },
          },
        });

      if (pending > 0) {
        throw new DispatchOperationConflictError({
          operationId: id,
          pendingLines: pending,
        });
      }

      await tx.operacionDespacho.update({
        where: { id },
        data: {
          estado: 'APLICADA',
          aplicadaEn: new Date(),
          fallidaEn: null,
          errorAplicacion: null,
          version: { increment: 1 },
        },
      });
    });
  }

  async markOperationFailed(
    id: number,
    error: string,
  ): Promise<void> {
    await this.prisma.operacionDespacho.update({
      where: { id },
      data: {
        estado: 'FALLIDA',
        aplicadaEn: null,
        fallidaEn: new Date(),
        errorAplicacion: safeError(error),
        version: { increment: 1 },
      },
    });
  }

  async netReservationsForDispatch(
    dispatchId: number,
  ): Promise<DispatchNetReservationLine[]> {
    const operations =
      await this.prisma.operacionDespacho.findMany({
        where: {
          ordenDespachoId: dispatchId,
          tipo: {
            in: [
              'RESERVA_PREPARACION',
              'SALIDA_DESPACHO',
              'LIBERACION_RESERVA',
            ],
          },
        },
        select: { id: true, tipo: true },
      });

    if (!operations.length) return [];

    const typeByOperation = new Map(
      operations.map((operation) => [
        operation.id,
        operation.tipo,
      ]),
    );

    const lines =
      await this.prisma.operacionDespachoDetalle.findMany({
        where: {
          operacionId: {
            in: operations.map((operation) => operation.id),
          },
          movimientoInventarioId: { not: null },
        },
      });

    if (!lines.length) return [];

    const details =
      await this.prisma.ordenDespachoDetalle.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                lines.map(
                  (line) => line.ordenDespachoDetalleId,
                ),
              ),
            ],
          },
        },
        select: {
          id: true,
          pedidoDetalleId: true,
          productoId: true,
        },
      });

    const detailById = new Map(
      details.map((detail) => [detail.id, detail]),
    );

    const result = new Map<
      number,
      DispatchNetReservationLine
    >();

    for (const line of lines) {
      const detail =
        detailById.get(line.ordenDespachoDetalleId);
      if (!detail) continue;

      const current = result.get(detail.id) ?? {
        ordenDespachoDetalleId: detail.id,
        pedidoDetalleId: detail.pedidoDetalleId,
        productoId: detail.productoId,
        cantidad: 0,
      };

      const type = typeByOperation.get(line.operacionId);
      const sign =
        type === 'RESERVA_PREPARACION' ? 1 : -1;

      result.set(detail.id, {
        ...current,
        cantidad:
          current.cantidad + sign * line.cantidad,
      });
    }

    return [...result.values()].filter(
      (item) => item.cantidad > 0,
    );
  }

  async hasPhysicalDispatchActivity(
    dispatchId: number,
  ): Promise<boolean> {
    const operations =
      await this.prisma.operacionDespacho.findMany({
        where: {
          ordenDespachoId: dispatchId,
          tipo: 'SALIDA_DESPACHO',
        },
        select: { id: true },
      });

    if (!operations.length) return false;

    const count =
      await this.prisma.operacionDespachoDetalle.count({
        where: {
          operacionId: {
            in: operations.map(
              (operation) => operation.id,
            ),
          },
          movimientoInventarioId: { not: null },
        },
      });

    return count > 0;
  }

  private async hydrateByKey(
    db: PrismaService | Prisma.TransactionClient,
    key: string,
    repeated: boolean,
  ): Promise<PreparedDispatchOperation | null> {
    if (!key) return null;

    const row = await db.operacionDespacho.findUnique({
      where: { claveIdempotencia: key },
      select: { id: true },
    });

    return row
      ? this.hydrate(db, row.id, repeated)
      : null;
  }

  private async hydrate(
    db: PrismaService | Prisma.TransactionClient,
    id: number,
    repeated: boolean,
  ): Promise<PreparedDispatchOperation | null> {
    const operation = await db.operacionDespacho.findUnique({
      where: { id },
    });

    if (!operation) return null;

    const dispatch = await db.ordenDespacho.findUnique({
      where: { id: operation.ordenDespachoId },
      include: {
        pedido: {
          select: { id: true, empresaId: true },
        },
      },
    });

    if (!dispatch) {
      throw new DispatchOperationConflictError({
        operationId: operation.id,
        ordenDespachoId: operation.ordenDespachoId,
      });
    }

    const lines =
      await db.operacionDespachoDetalle.findMany({
        where: { operacionId: operation.id },
        orderBy: { id: 'asc' },
      });

    const detailIds = [
      ...new Set(
        lines.map(
          (line) => line.ordenDespachoDetalleId,
        ),
      ),
    ];

    const details =
      detailIds.length > 0
        ? await db.ordenDespachoDetalle.findMany({
            where: { id: { in: detailIds } },
            select: {
              id: true,
              pedidoDetalleId: true,
              productoId: true,
            },
          })
        : [];

    const detailById = new Map(
      details.map((detail) => [detail.id, detail]),
    );

    return {
      id: operation.id,
      ordenDespachoId: operation.ordenDespachoId,
      pedidoId: dispatch.pedido.id,
      empresaId: dispatch.pedido.empresaId,
      bodegaId: dispatch.bodegaId,
      usuarioId: operation.usuarioId,
      tipo: operation.tipo as DispatchOperationType,
      estado: operation.estado as DispatchOperationState,
      estadoDespacho: dispatch.estado as DispatchState,
      claveIdempotencia: operation.claveIdempotencia,
      observaciones: operation.observaciones,
      ocurridaEn: operation.ocurridaEn,
      intentos: operation.intentos,
      version: operation.version,
      repeated,
      detalles: lines.map((line) => {
        const detail =
          detailById.get(line.ordenDespachoDetalleId);

        if (!detail) {
          throw new DispatchOperationConflictError({
            operationId: operation.id,
            ordenDespachoDetalleId:
              line.ordenDespachoDetalleId,
          });
        }

        return {
          id: line.id,
          ordenDespachoDetalleId:
            line.ordenDespachoDetalleId,
          pedidoDetalleId: detail.pedidoDetalleId,
          productoId: detail.productoId,
          cantidad: line.cantidad,
          estado: line.estado,
          reservaInventarioId:
            line.reservaInventarioId,
          movimientoInventarioId:
            line.movimientoInventarioId,
          claveIdempotencia:
            line.claveIdempotencia,
          errorAplicacion:
            line.errorAplicacion,
        };
      }),
    };
  }

  private assertSamePreparedCommand(
    existing: PreparedDispatchOperation,
    command: PrepareDispatchOperationCommand,
  ): void {
    if (
      existing.ordenDespachoId !==
        command.ordenDespachoId ||
      existing.tipo !== command.tipo
    ) {
      throw new DispatchIdempotencyConflictError({
        claveIdempotencia:
          command.claveIdempotencia,
      });
    }

    const current = [...existing.detalles]
      .map((line) => ({
        id: line.ordenDespachoDetalleId,
        cantidad: line.cantidad,
      }))
      .sort((a, b) => a.id - b.id);

    const requested = [...command.detalles]
      .map((line) => ({
        id: line.ordenDespachoDetalleId,
        cantidad: line.cantidad,
      }))
      .sort((a, b) => a.id - b.id);

    const same =
      current.length === requested.length &&
      current.every(
        (line, index) =>
          line.id === requested[index].id &&
          line.cantidad ===
            requested[index].cantidad,
      );

    if (!same) {
      throw new DispatchIdempotencyConflictError({
        claveIdempotencia:
          command.claveIdempotencia,
        reason:
          'La misma clave fue utilizada con otro payload.',
      });
    }
  }
}

function normalize(
  value?: string | null,
): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function safeError(value: string): string {
  const normalized = String(value ?? '').trim();
  return normalized.length
    ? normalized.slice(0, 4000)
    : 'Error desconocido';
}
