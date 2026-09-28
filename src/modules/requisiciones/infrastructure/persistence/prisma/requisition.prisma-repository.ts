import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { Requisition } from '../../../domain/entities/requisition.entity';
import {
  RequisitionConcurrentModificationError,
  RequisitionNotFoundError,
  RequisitionIdempotencyConflictError,
  RequisitionReceiptConflictError,
  RequisitionValidationError,
} from '../../../domain/errors/requisition.errors';
import { RequisitionAuditDraft } from '../../../domain/requisition.types';
import {
  PreparedReceipt,
  PrepareReceiptCommand,
  RequisitionRepositoryPort,
} from '../../../domain/ports/requisition.repository.port';
import { RequisitionPrismaMapper } from './requisition.prisma-mapper';

const receiptInclude = {
  detalles: {
    include: {
      requisicionDetalle: { select: { productoId: true } },
    },
  },
  requisicion: {
    select: { bodegaDestinoId: true, proveedorId: true },
  },
} satisfies Prisma.RecepcionRequisicionInclude;

type PreparedReceiptRow = Prisma.RecepcionRequisicionGetPayload<{
  include: typeof receiptInclude;
}>;

@Injectable()
export class RequisitionPrismaRepository implements RequisitionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<Requisition | null> {
    const row = await this.prisma.requisicion.findUnique({
      where: { id },
      include: { detalles: { orderBy: { id: 'asc' } } },
    });
    return row ? RequisitionPrismaMapper.toDomain(row) : null;
  }

  async create(
    entity: Requisition,
    audit: RequisitionAuditDraft,
  ): Promise<Requisition> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.requisicion.create({
        data: {
          empresaId: entity.empresaId,
          bodegaDestinoId: entity.bodegaDestinoId,
          proveedorId: entity.proveedorId,
          solicitanteId: entity.solicitanteId,
          estado: entity.estado,
          observaciones: entity.observaciones,
          version: entity.version,
          ...(entity.detalles.length
            ? {
                detalles: {
                  create: entity.detalles.map((detail) => ({
                    productoId: detail.productoId,
                    cantidadSolicitada: detail.cantidadSolicitada,
                    cantidadRecibida: detail.cantidadRecibida ?? 0,
                    costoUnitarioEstimado: detail.costoUnitarioEstimado ?? null,
                    version: detail.version ?? 0,
                  })),
                },
              }
            : {}),
        },
        include: { detalles: { orderBy: { id: 'asc' } } },
      });
      await this.persistAudit(tx, created.id, audit);
      return created;
    });
    return RequisitionPrismaMapper.toDomain(row);
  }

  async save(
    entity: Requisition,
    expectedVersion: number,
    audit: RequisitionAuditDraft,
  ): Promise<Requisition> {
    if (!entity.id) throw new Error('No se puede guardar una requisición sin id.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.requisicion.updateMany({
        where: { id: entity.id!, version: expectedVersion },
        data: {
          bodegaDestinoId: entity.bodegaDestinoId,
          proveedorId: entity.proveedorId,
          estado: entity.estado,
          observaciones: entity.observaciones,
          solicitadaEn: entity.solicitadaEn,
          aprobadaEn: entity.aprobadaEn,
          rechazadaEn: entity.rechazadaEn,
          canceladaEn: entity.canceladaEn,
          completadaEn: entity.completadaEn,
          motivoRechazo: entity.motivoRechazo,
          motivoCancelacion: entity.motivoCancelacion,
          version: entity.version,
        },
      });

      if (updated.count !== 1) {
        throw new RequisitionConcurrentModificationError({
          requisicionId: entity.id,
          expectedVersion,
        });
      }

      // Solo BORRADOR puede reemplazar líneas. Una vez solicitado, los detalles
      // quedan congelados y las recepciones acumulan sobre ellos.
      if (entity.estado === 'BORRADOR') {
        await tx.requisicionDetalle.deleteMany({
          where: { requisicionId: entity.id },
        });
        if (entity.detalles.length) {
          await tx.requisicionDetalle.createMany({
            data: entity.detalles.map((detail) => ({
              requisicionId: entity.id!,
              productoId: detail.productoId,
              cantidadSolicitada: detail.cantidadSolicitada,
              cantidadRecibida: 0,
              costoUnitarioEstimado: detail.costoUnitarioEstimado ?? null,
              version: 0,
            })),
          });
        }
      }

      await this.persistAudit(tx, entity.id, audit);
      const row = await tx.requisicion.findUniqueOrThrow({
        where: { id: entity.id },
        include: { detalles: { orderBy: { id: 'asc' } } },
      });
      return RequisitionPrismaMapper.toDomain(row);
    });
  }

  async prepareReceipt(command: PrepareReceiptCommand): Promise<PreparedReceipt> {
    return this.withSerializableRetry(async () =>
      this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.recepcionRequisicion.findUnique({
            where: { claveIdempotencia: command.claveIdempotencia },
            include: receiptInclude,
          });
          if (existing) {
            this.assertSameReceiptCommand(existing, command);
            return this.toPreparedReceipt(existing, true);
          }

          const requisition = await tx.requisicion.findUnique({
            where: { id: command.requisicionId },
            include: { detalles: true },
          });
          if (!requisition) throw new RequisitionNotFoundError(command.requisicionId);
          if (!['APROBADA', 'PARCIAL'].includes(requisition.estado)) {
            throw new RequisitionValidationError(
              'La requisición no está habilitada para recibir mercadería.',
              { estado: requisition.estado },
            );
          }
          if (!requisition.proveedorId) {
            throw new RequisitionValidationError(
              'La requisición no tiene proveedor asignado.',
            );
          }

          const ids = command.detalles.map((line) => line.requisicionDetalleId);
          if (new Set(ids).size !== ids.length) {
            throw new RequisitionValidationError(
              'Un detalle de requisición no puede repetirse en la misma recepción.',
            );
          }

          const detailMap = new Map(requisition.detalles.map((detail) => [detail.id, detail]));
          for (const line of command.detalles) {
            const detail = detailMap.get(line.requisicionDetalleId);
            if (!detail) {
              throw new RequisitionValidationError(
                'El detalle no pertenece a la requisición.',
                { requisicionDetalleId: line.requisicionDetalleId },
              );
            }
            if (!Number.isInteger(line.cantidad) || line.cantidad <= 0) {
              throw new RequisitionValidationError('La cantidad recibida debe ser mayor que cero.');
            }
            if (Number(line.costoUnitario) < 0) {
              throw new RequisitionValidationError('El costo unitario no puede ser negativo.');
            }

            const claims = await tx.recepcionRequisicionDetalle.aggregate({
              where: {
                requisicionDetalleId: detail.id,
                recepcion: { estado: { in: ['PENDIENTE', 'FALLIDA'] } },
              },
              _sum: { cantidad: true },
            });
            const claimed = claims._sum.cantidad ?? 0;
            const available =
              detail.cantidadSolicitada - detail.cantidadRecibida - claimed;
            if (line.cantidad > available) {
              throw new RequisitionReceiptConflictError({
                requisicionDetalleId: detail.id,
                cantidadPendiente: available,
                requested: line.cantidad,
              });
            }
          }

          try {
            const created = await tx.recepcionRequisicion.create({
              data: {
                requisicionId: command.requisicionId,
                recibidoPorId: command.recibidoPorId,
                estado: 'PENDIENTE',
                claveIdempotencia: command.claveIdempotencia,
                documentoReferencia: normalize(command.documentoReferencia),
                observaciones: normalize(command.observaciones),
                ...(command.recibidoEn ? { recibidoEn: command.recibidoEn } : {}),
                detalles: {
                  create: command.detalles.map((line) => ({
                    requisicionDetalleId: line.requisicionDetalleId,
                    cantidad: line.cantidad,
                    costoUnitario: line.costoUnitario,
                  })),
                },
              },
              include: receiptInclude,
            });
            return this.toPreparedReceipt(created, false);
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              throw new RequisitionConcurrentModificationError({
                claveIdempotencia: command.claveIdempotencia,
              });
            }
            throw error;
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async markReceiptFailed(receiptId: number, error: string): Promise<void> {
    await this.prisma.recepcionRequisicion.updateMany({
      where: { id: receiptId, estado: { not: 'APLICADA' } },
      data: {
        estado: 'FALLIDA',
        errorAplicacion: error.slice(0, 2000),
      },
    });
  }

  async finalizeReceipt(receiptId: number, actorId: number): Promise<void> {
    await this.withSerializableRetry(async () =>
      this.prisma.$transaction(
        async (tx) => {
          const receipt = await tx.recepcionRequisicion.findUnique({
            where: { id: receiptId },
            include: {
              detalles: true,
              requisicion: { include: { detalles: true } },
            },
          });
          if (!receipt) {
            throw new RequisitionValidationError('La recepción no existe.', { receiptId });
          }
          if (receipt.estado === 'APLICADA') return;
          if (!['APROBADA', 'PARCIAL'].includes(receipt.requisicion.estado)) {
            throw new RequisitionValidationError(
              'La requisición cambió a un estado que no permite completar la recepción.',
              { estado: receipt.requisicion.estado },
            );
          }

          const receivedById = new Map<number, number>();
          for (const line of receipt.detalles) {
            const current = receipt.requisicion.detalles.find(
              (detail) => detail.id === line.requisicionDetalleId,
            );
            if (!current) {
              throw new RequisitionValidationError('Detalle de requisición inexistente.');
            }
            const next = current.cantidadRecibida + line.cantidad;
            if (next > current.cantidadSolicitada) {
              throw new RequisitionReceiptConflictError({
                requisicionDetalleId: current.id,
                requestedTotal: next,
                cantidadSolicitada: current.cantidadSolicitada,
              });
            }
            const changed = await tx.requisicionDetalle.updateMany({
              where: { id: current.id, version: current.version },
              data: { cantidadRecibida: next, version: current.version + 1 },
            });
            if (changed.count !== 1) {
              throw new RequisitionConcurrentModificationError({
                requisicionDetalleId: current.id,
              });
            }
            receivedById.set(current.id, next);
          }

          const complete = receipt.requisicion.detalles.every((detail) => {
            const received = receivedById.get(detail.id) ?? detail.cantidadRecibida;
            return received === detail.cantidadSolicitada;
          });
          const nextState = complete ? 'COMPLETADA' : 'PARCIAL';
          const req = await tx.requisicion.updateMany({
            where: {
              id: receipt.requisicionId,
              version: receipt.requisicion.version,
            },
            data: {
              estado: nextState,
              completadaEn: complete ? new Date() : null,
              version: receipt.requisicion.version + 1,
            },
          });
          if (req.count !== 1) {
            throw new RequisitionConcurrentModificationError({
              requisicionId: receipt.requisicionId,
            });
          }

          await tx.recepcionRequisicion.update({
            where: { id: receiptId },
            data: { estado: 'APLICADA', aplicadaEn: new Date(), errorAplicacion: null },
          });

          const units = receipt.detalles.reduce((sum, line) => sum + line.cantidad, 0);
          await tx.requisicionEvento.create({
            data: {
              requisicionId: receipt.requisicionId,
              usuarioId: actorId,
              tipo: 'RECEPCION_REGISTRADA',
              detalle: `Recepción #${receipt.id} aplicada: ${units} unidades.`,
            },
          });
          if (complete) {
            await tx.requisicionEvento.create({
              data: {
                requisicionId: receipt.requisicionId,
                usuarioId: actorId,
                tipo: 'COMPLETADA',
                detalle: 'Requisición completada por recepción total.',
              },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async persistAudit(
    tx: Prisma.TransactionClient,
    requisicionId: number,
    audit: RequisitionAuditDraft,
  ): Promise<void> {
    await tx.requisicionEvento.create({
      data: {
        requisicionId,
        usuarioId: audit.actorId ?? null,
        tipo: audit.type,
        detalle: audit.detail ?? null,
      },
    });
  }

  private toPreparedReceipt(row: PreparedReceiptRow, repeated: boolean): PreparedReceipt {
    if (!row.requisicion.proveedorId) {
      throw new RequisitionValidationError('La requisición no tiene proveedor asignado.');
    }
    return {
      id: row.id,
      requisicionId: row.requisicionId,
      bodegaDestinoId: row.requisicion.bodegaDestinoId,
      proveedorId: row.requisicion.proveedorId,
      recibidoPorId: row.recibidoPorId,
      estado: row.estado,
      claveIdempotencia: row.claveIdempotencia,
      repeated,
      detalles: row.detalles.map((line) => ({
        id: line.id,
        requisicionDetalleId: line.requisicionDetalleId,
        productoId: line.requisicionDetalle.productoId,
        cantidad: line.cantidad,
        costoUnitario: line.costoUnitario.toString(),
      })),
    };
  }

  private assertSameReceiptCommand(row: PreparedReceiptRow, command: PrepareReceiptCommand): void {
    if (row.requisicionId !== command.requisicionId) {
      throw new RequisitionIdempotencyConflictError({
        claveIdempotencia: command.claveIdempotencia,
        existingRequisicionId: row.requisicionId,
        requestedRequisicionId: command.requisicionId,
      });
    }
    const existing = [...row.detalles]
      .map((line) => ({
        requisicionDetalleId: line.requisicionDetalleId,
        cantidad: line.cantidad,
        costoUnitario: line.costoUnitario.toFixed(4),
      }))
      .sort((a, b) => a.requisicionDetalleId - b.requisicionDetalleId);
    const requested = command.detalles
      .map((line) => ({
        requisicionDetalleId: line.requisicionDetalleId,
        cantidad: line.cantidad,
        costoUnitario: Number(line.costoUnitario).toFixed(4),
      }))
      .sort((a, b) => a.requisicionDetalleId - b.requisicionDetalleId);
    const same =
      existing.length === requested.length &&
      existing.every((line, index) => {
        const other = requested[index];
        return (
          line.requisicionDetalleId === other.requisicionDetalleId &&
          line.cantidad === other.cantidad &&
          line.costoUnitario === other.costoUnitario
        );
      });
    if (!same) {
      throw new RequisitionIdempotencyConflictError({
        claveIdempotencia: command.claveIdempotencia,
      });
    }
  }

  private async withSerializableRetry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        last = error;
        const retryable =
          error instanceof RequisitionConcurrentModificationError ||
          (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034');
        if (!retryable || attempt === attempts) throw error;
      }
    }
    throw last;
  }
}

function normalize(value?: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}
