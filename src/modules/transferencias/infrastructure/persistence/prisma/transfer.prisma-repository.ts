import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  FinalizeTransferOperationResult,
  PreparedTransferOperation,
  PrepareTransferOperationCommand,
  RegisterTransferOperationLineResultCommand,
  TransferOperationRepositoryPort,
} from '../../../application/ports/transfer-operation.repository.port';
import {
  TransferConcurrentModificationError,
  TransferIdempotencyConflictError,
  TransferInvalidStateError,
  TransferNotFoundError,
  TransferOperationConflictError,
  TransferValidationError,
} from '../../../domain/errors/transfer.errors';
import { TransferRepositoryPort } from '../../../domain/ports/transfer.repository.port';
import { TransferAuditDraft } from '../../../transfer.types';
import { TransferenciaBodega } from '../../../domain/entities/transfer.entity';
import { TransferPrismaMapper } from './transfer.prisma-mapper';

const entityInclude = {
  detalles: {
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.TransferenciaBodegaInclude;

const preparedOperationInclude = {
  transferencia: {
    select: {
      id: true,
      estado: true,
      bodegaOrigenId: true,
      bodegaDestinoId: true,
    },
  },
  detalles: {
    orderBy: { id: 'asc' as const },
    include: {
      transferenciaDetalle: {
        select: {
          id: true,
          productoId: true,
        },
      },
    },
  },
} satisfies Prisma.TransferenciaBodegaOperacionInclude;

type PreparedOperationRow =
  Prisma.TransferenciaBodegaOperacionGetPayload<{
    include: typeof preparedOperationInclude;
  }>;

@Injectable()
export class TransferPrismaRepository
  implements TransferRepositoryPort, TransferOperationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<TransferenciaBodega | null> {
    const row = await this.prisma.transferenciaBodega.findUnique({
      where: { id },
      include: entityInclude,
    });

    return row ? TransferPrismaMapper.toDomain(row) : null;
  }

  async create(
    entity: TransferenciaBodega,
    audit: TransferAuditDraft,
  ): Promise<TransferenciaBodega> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.transferenciaBodega.create({
          data: {
            bodegaOrigenId: entity.bodegaOrigenId,
            bodegaDestinoId: entity.bodegaDestinoId,
            creadoPorId: entity.creadoPorId,
            estado: entity.estado,
            observaciones: entity.observaciones,
            motivoCancelacion: entity.motivoCancelacion,
            preparadaEn: entity.preparadaEn,
            enviadaEn: entity.enviadaEn,
            recibidaEn: entity.recibidaEn,
            canceladaEn: entity.canceladaEn,
            version: entity.version,
            ...(entity.detalles.length
              ? {
                  detalles: {
                    create: entity.detalles.map((detail) => ({
                      productoId: detail.productoId,
                      cantidadSolicitada: detail.cantidadSolicitada,
                      cantidadEnviada: detail.cantidadEnviada ?? 0,
                      cantidadRecibida: detail.cantidadRecibida ?? 0,
                      observaciones: detail.observaciones ?? null,
                      version: detail.version ?? 0,
                    })),
                  },
                }
              : {}),
          },
          include: entityInclude,
        });

        await this.persistAudit(tx, row.id, audit);
        return TransferPrismaMapper.toDomain(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async save(
    entity: TransferenciaBodega,
    expectedVersion: number,
    audit: TransferAuditDraft,
  ): Promise<TransferenciaBodega> {
    if (!entity.id) {
      throw new TransferValidationError(
        'No se puede actualizar una transferencia sin id.',
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const changed = await tx.transferenciaBodega.updateMany({
            where: {
              id: entity.id!,
              version: expectedVersion,
            },
            data: {
              bodegaOrigenId: entity.bodegaOrigenId,
              bodegaDestinoId: entity.bodegaDestinoId,
              estado: entity.estado,
              observaciones: entity.observaciones,
              motivoCancelacion: entity.motivoCancelacion,
              preparadaEn: entity.preparadaEn,
              enviadaEn: entity.enviadaEn,
              recibidaEn: entity.recibidaEn,
              canceladaEn: entity.canceladaEn,
              version: entity.version,
            },
          });

          if (changed.count !== 1) {
            throw new TransferConcurrentModificationError({
              transferenciaId: entity.id,
              expectedVersion,
            });
          }

          // Los detalles solo son editables en BORRADOR. Reemplazarlos aquí
          // mantiene un único camino de persistencia y evita mutaciones
          // después de que existan operaciones físicas.
          if (entity.estado === 'BORRADOR') {
            await tx.transferenciaBodegaDetalle.deleteMany({
              where: { transferenciaId: entity.id },
            });

            if (entity.detalles.length) {
              await tx.transferenciaBodegaDetalle.createMany({
                data: entity.detalles.map((detail) => ({
                  transferenciaId: entity.id!,
                  productoId: detail.productoId,
                  cantidadSolicitada: detail.cantidadSolicitada,
                  cantidadEnviada: 0,
                  cantidadRecibida: 0,
                  observaciones: detail.observaciones ?? null,
                  version: 0,
                })),
              });
            }
          }

          await this.persistAudit(tx, entity.id, audit);

          const row = await tx.transferenciaBodega.findUniqueOrThrow({
            where: { id: entity.id },
            include: entityInclude,
          });

          return TransferPrismaMapper.toDomain(row);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async hasUnresolvedOperations(
    transferenciaId: number,
  ): Promise<boolean> {
    const count = await this.prisma.transferenciaBodegaOperacion.count({
      where: {
        transferenciaId,
        estado: { in: ['PENDIENTE', 'FALLIDA'] },
      },
    });

    return count > 0;
  }

  async prepareOperation(
    command: PrepareTransferOperationCommand,
  ): Promise<PreparedTransferOperation> {
    const normalizedKey = command.claveIdempotencia.trim();
    if (!normalizedKey) {
      throw new TransferValidationError(
        'La clave de idempotencia es obligatoria.',
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          // Idempotencia primero: una operación aplicada puede haber movido
          // el agregado a un estado que ya no permite repetir la transición.
          const existing = await tx.transferenciaBodegaOperacion.findUnique({
            where: { claveIdempotencia: normalizedKey },
            include: preparedOperationInclude,
          });

          if (existing) {
            this.assertSameOperationCommand(existing, command);
            return this.toPreparedOperation(existing, true);
          }

          const transferencia = await tx.transferenciaBodega.findUnique({
            where: { id: command.transferenciaId },
            include: {
              detalles: {
                orderBy: { id: 'asc' },
              },
            },
          });

          if (!transferencia) {
            throw new TransferNotFoundError(command.transferenciaId);
          }

          let operationLines: Array<{
            transferenciaDetalleId: number;
            cantidad: number;
            costoUnitario: string | null;
          }>;

          if (command.tipo === 'SALIDA') {
            if (transferencia.estado !== 'PREPARADA') {
              throw new TransferInvalidStateError(
                transferencia.estado,
                'enviar',
              );
            }

            if (!transferencia.detalles.length) {
              throw new TransferValidationError(
                'La transferencia no contiene productos.',
              );
            }

            const blocked = await tx.transferenciaBodegaOperacion.findFirst({
              where: {
                transferenciaId: transferencia.id,
                tipo: 'SALIDA',
                estado: { in: ['PENDIENTE', 'FALLIDA'] },
              },
              select: {
                id: true,
                claveIdempotencia: true,
                estado: true,
              },
              orderBy: { id: 'asc' },
            });

            if (blocked) {
              throw new TransferOperationConflictError({
                operationId: blocked.id,
                estado: blocked.estado,
                claveIdempotencia: blocked.claveIdempotencia,
                instruction:
                  'Reintenta la salida utilizando la clave de idempotencia de la operación existente.',
              });
            }

            operationLines = transferencia.detalles.map((detail) => ({
              transferenciaDetalleId: detail.id,
              cantidad: detail.cantidadSolicitada,
              costoUnitario: null,
            }));
          } else {
            if (
              !['EN_TRANSITO', 'RECIBIDA_PARCIAL'].includes(
                transferencia.estado,
              )
            ) {
              throw new TransferInvalidStateError(
                transferencia.estado,
                'recibir',
              );
            }

            operationLines = await this.prepareReceiptLines(
              tx,
              transferencia,
              command,
            );
          }

          const row = await tx.transferenciaBodegaOperacion.create({
            data: {
              transferenciaId: transferencia.id,
              usuarioId: command.usuarioId,
              tipo: command.tipo,
              estado: 'PENDIENTE',
              claveIdempotencia: normalizedKey,
              documentoReferencia:
                normalize(command.documentoReferencia) ?? null,
              observaciones: normalize(command.observaciones) ?? null,
              ocurridaEn: command.ocurridaEn ?? new Date(),
              version: 0,
              detalles: {
                create: operationLines.map((line) => ({
                  transferenciaDetalleId: line.transferenciaDetalleId,
                  cantidad: line.cantidad,
                  costoUnitario: line.costoUnitario,
                })),
              },
            },
            include: preparedOperationInclude,
          });

          return this.toPreparedOperation(row, false);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async registerLineResult(
    command: RegisterTransferOperationLineResultCommand,
  ): Promise<void> {
    const cost = new Prisma.Decimal(command.costoUnitario);
    if (cost.isNegative()) {
      throw new TransferValidationError(
        'El costo histórico de transferencia no puede ser negativo.',
        { operacionDetalleId: command.operacionDetalleId },
      );
    }

    const row = await this.prisma.transferenciaBodegaOperacionDetalle.findUnique({
      where: { id: command.operacionDetalleId },
      select: {
        id: true,
        costoUnitario: true,
      },
    });

    if (!row) {
      throw new TransferValidationError(
        'El detalle de operación de transferencia no existe.',
        { operacionDetalleId: command.operacionDetalleId },
      );
    }

    if (row.costoUnitario != null) {
      if (row.costoUnitario.toFixed(4) !== cost.toFixed(4)) {
        throw new TransferOperationConflictError({
          operacionDetalleId: row.id,
          existingCost: row.costoUnitario.toFixed(4),
          requestedCost: cost.toFixed(4),
        });
      }
      return;
    }

    const updated =
      await this.prisma.transferenciaBodegaOperacionDetalle.updateMany({
        where: {
          id: row.id,
          costoUnitario: null,
        },
        data: {
          costoUnitario: cost,
        },
      });

    if (updated.count === 1) return;

    const concurrent =
      await this.prisma.transferenciaBodegaOperacionDetalle.findUnique({
        where: { id: row.id },
        select: { costoUnitario: true },
      });

    if (
      concurrent?.costoUnitario?.toFixed(4) !== cost.toFixed(4)
    ) {
      throw new TransferConcurrentModificationError({
        operacionDetalleId: row.id,
      });
    }
  }

  async markOperationFailed(
    operationId: number,
    error: string,
  ): Promise<void> {
    const operation = await this.prisma.transferenciaBodegaOperacion.findUnique({
      where: { id: operationId },
      select: {
        id: true,
        transferenciaId: true,
        usuarioId: true,
        tipo: true,
        estado: true,
      },
    });

    if (!operation || operation.estado === 'APLICADA') return;

    const message = error.slice(0, 2000);

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.transferenciaBodegaOperacion.updateMany({
        where: {
          id: operation.id,
          estado: { not: 'APLICADA' },
        },
        data: {
          estado: 'FALLIDA',
          errorAplicacion: message,
          version: { increment: 1 },
        },
      });

      if (changed.count !== 1) return;

      await tx.transferenciaBodegaEvento.create({
        data: {
          transferenciaId: operation.transferenciaId,
          usuarioId: operation.usuarioId,
          tipo: 'OPERACION_FALLIDA',
          detalle: `Operación #${operation.id} ${operation.tipo} fallida: ${message}`,
        },
      });
    });
  }

  async finalizeOperation(
    operationId: number,
    actorId: number,
  ): Promise<FinalizeTransferOperationResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const operation =
            await tx.transferenciaBodegaOperacion.findUnique({
              where: { id: operationId },
              include: {
                detalles: {
                  orderBy: { id: 'asc' },
                },
                transferencia: {
                  include: {
                    detalles: {
                      orderBy: { id: 'asc' },
                    },
                  },
                },
              },
            });

          if (!operation) {
            throw new TransferValidationError(
              'La operación de transferencia no existe.',
              { operationId },
            );
          }

          if (operation.estado === 'APLICADA') {
            return {
              operacionId: operation.id,
              transferenciaId: operation.transferenciaId,
              estadoOperacion: 'APLICADA' as const,
              estadoTransferencia: operation.transferencia.estado,
            };
          }

          if (operation.tipo === 'SALIDA') {
            return this.finalizeOutbound(tx, operation, actorId);
          }

          return this.finalizeReceipt(tx, operation, actorId);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async prepareReceiptLines(
    tx: Prisma.TransactionClient,
    transferencia: Prisma.TransferenciaBodegaGetPayload<{
      include: { detalles: true };
    }>,
    command: PrepareTransferOperationCommand,
  ) {
    const requested = command.detalles ?? [];
    if (!requested.length) {
      throw new TransferValidationError(
        'La recepción debe contener al menos un detalle.',
      );
    }

    const seen = new Set<number>();
    for (const line of requested) {
      if (seen.has(line.transferenciaDetalleId)) {
        throw new TransferValidationError(
          'No se puede repetir un detalle dentro de la misma recepción.',
          { transferenciaDetalleId: line.transferenciaDetalleId },
        );
      }
      seen.add(line.transferenciaDetalleId);

      if (!Number.isInteger(line.cantidad) || line.cantidad <= 0) {
        throw new TransferValidationError(
          'La cantidad recibida debe ser un entero positivo.',
          { transferenciaDetalleId: line.transferenciaDetalleId },
        );
      }
    }

    const claims = await tx.transferenciaBodegaOperacion.findMany({
      where: {
        transferenciaId: transferencia.id,
        tipo: 'RECEPCION',
        estado: { in: ['PENDIENTE', 'FALLIDA'] },
      },
      select: {
        detalles: {
          select: {
            transferenciaDetalleId: true,
            cantidad: true,
          },
        },
      },
    });

    const claimedByDetail = new Map<number, number>();
    for (const operation of claims) {
      for (const line of operation.detalles) {
        claimedByDetail.set(
          line.transferenciaDetalleId,
          (claimedByDetail.get(line.transferenciaDetalleId) ?? 0) +
            line.cantidad,
        );
      }
    }

    const result: Array<{
      transferenciaDetalleId: number;
      cantidad: number;
      costoUnitario: string;
    }> = [];

    for (const line of requested) {
      const detail = transferencia.detalles.find(
        (item) => item.id === line.transferenciaDetalleId,
      );

      if (!detail) {
        throw new TransferValidationError(
          'El detalle no pertenece a la transferencia.',
          { transferenciaDetalleId: line.transferenciaDetalleId },
        );
      }

      const claimed = claimedByDetail.get(detail.id) ?? 0;
      const available =
        detail.cantidadEnviada - detail.cantidadRecibida - claimed;

      if (line.cantidad > available) {
        throw new TransferOperationConflictError({
          transferenciaDetalleId: detail.id,
          cantidadSolicitadaRecepcion: line.cantidad,
          cantidadDisponibleRecepcion: available,
          cantidadYaRecibida: detail.cantidadRecibida,
          cantidadReclamadaPorOperacionesPendientes: claimed,
        });
      }

      const outbound =
        await tx.transferenciaBodegaOperacionDetalle.findFirst({
          where: {
            transferenciaDetalleId: detail.id,
            operacion: {
              transferenciaId: transferencia.id,
              tipo: 'SALIDA',
              estado: 'APLICADA',
            },
          },
          select: {
            costoUnitario: true,
          },
          orderBy: {
            id: 'asc',
          },
        });

      if (outbound?.costoUnitario == null) {
        throw new TransferOperationConflictError({
          transferenciaDetalleId: detail.id,
          reason:
            'No existe una salida aplicada con costo histórico para este producto.',
        });
      }

      result.push({
        transferenciaDetalleId: detail.id,
        cantidad: line.cantidad,
        costoUnitario: outbound.costoUnitario.toFixed(4),
      });
    }

    return result;
  }

  private async finalizeOutbound(
    tx: Prisma.TransactionClient,
    operation: Prisma.TransferenciaBodegaOperacionGetPayload<{
      include: {
        detalles: true;
        transferencia: { include: { detalles: true } };
      };
    }>,
    actorId: number,
  ): Promise<FinalizeTransferOperationResult> {
    const transferencia = operation.transferencia;

    if (transferencia.estado !== 'PREPARADA') {
      throw new TransferInvalidStateError(
        transferencia.estado,
        'finalizar salida',
      );
    }

    if (operation.detalles.length !== transferencia.detalles.length) {
      throw new TransferOperationConflictError({
        operationId: operation.id,
        reason: 'La salida no contiene todos los productos de la transferencia.',
      });
    }

    for (const line of operation.detalles) {
      const detail = transferencia.detalles.find(
        (item) => item.id === line.transferenciaDetalleId,
      );

      if (!detail) {
        throw new TransferOperationConflictError({
          operationId: operation.id,
          transferenciaDetalleId: line.transferenciaDetalleId,
        });
      }

      if (
        line.cantidad !== detail.cantidadSolicitada ||
        line.costoUnitario == null
      ) {
        throw new TransferOperationConflictError({
          operationId: operation.id,
          transferenciaDetalleId: detail.id,
          requested: detail.cantidadSolicitada,
          operationQuantity: line.cantidad,
          hasHistoricalCost: line.costoUnitario != null,
        });
      }

      const changed = await tx.transferenciaBodegaDetalle.updateMany({
        where: {
          id: detail.id,
          version: detail.version,
        },
        data: {
          cantidadEnviada: detail.cantidadSolicitada,
          version: detail.version + 1,
        },
      });

      if (changed.count !== 1) {
        throw new TransferConcurrentModificationError({
          transferenciaDetalleId: detail.id,
        });
      }
    }

    const parent = await tx.transferenciaBodega.updateMany({
      where: {
        id: transferencia.id,
        version: transferencia.version,
        estado: 'PREPARADA',
      },
      data: {
        estado: 'EN_TRANSITO',
        enviadaEn: operation.ocurridaEn,
        version: transferencia.version + 1,
      },
    });

    if (parent.count !== 1) {
      throw new TransferConcurrentModificationError({
        transferenciaId: transferencia.id,
      });
    }

    await tx.transferenciaBodegaOperacion.update({
      where: { id: operation.id },
      data: {
        estado: 'APLICADA',
        aplicadaEn: new Date(),
        errorAplicacion: null,
        version: { increment: 1 },
      },
    });

    const units = operation.detalles.reduce(
      (sum, line) => sum + line.cantidad,
      0,
    );

    await tx.transferenciaBodegaEvento.create({
      data: {
        transferenciaId: transferencia.id,
        usuarioId: actorId,
        tipo: 'SALIDA_REGISTRADA',
        detalle: `Salida #${operation.id} aplicada: ${units} unidades enviadas.`,
      },
    });

    return {
      operacionId: operation.id,
      transferenciaId: transferencia.id,
      estadoOperacion: 'APLICADA',
      estadoTransferencia: 'EN_TRANSITO',
    };
  }

  private async finalizeReceipt(
    tx: Prisma.TransactionClient,
    operation: Prisma.TransferenciaBodegaOperacionGetPayload<{
      include: {
        detalles: true;
        transferencia: { include: { detalles: true } };
      };
    }>,
    actorId: number,
  ): Promise<FinalizeTransferOperationResult> {
    const transferencia = operation.transferencia;

    if (
      !['EN_TRANSITO', 'RECIBIDA_PARCIAL'].includes(transferencia.estado)
    ) {
      throw new TransferInvalidStateError(
        transferencia.estado,
        'finalizar recepción',
      );
    }

    const receivedByDetail = new Map<number, number>();

    for (const line of operation.detalles) {
      const detail = transferencia.detalles.find(
        (item) => item.id === line.transferenciaDetalleId,
      );

      if (!detail) {
        throw new TransferOperationConflictError({
          operationId: operation.id,
          transferenciaDetalleId: line.transferenciaDetalleId,
        });
      }

      if (line.costoUnitario == null) {
        throw new TransferOperationConflictError({
          operationId: operation.id,
          transferenciaDetalleId: detail.id,
          reason: 'El detalle de recepción no tiene costo histórico.',
        });
      }

      const next = detail.cantidadRecibida + line.cantidad;
      if (next > detail.cantidadEnviada) {
        throw new TransferOperationConflictError({
          transferenciaDetalleId: detail.id,
          cantidadEnviada: detail.cantidadEnviada,
          cantidadRecibidaActual: detail.cantidadRecibida,
          cantidadOperacion: line.cantidad,
        });
      }

      const changed = await tx.transferenciaBodegaDetalle.updateMany({
        where: {
          id: detail.id,
          version: detail.version,
        },
        data: {
          cantidadRecibida: next,
          version: detail.version + 1,
        },
      });

      if (changed.count !== 1) {
        throw new TransferConcurrentModificationError({
          transferenciaDetalleId: detail.id,
        });
      }

      receivedByDetail.set(detail.id, next);
    }

    const complete = transferencia.detalles.every((detail) => {
      const received =
        receivedByDetail.get(detail.id) ?? detail.cantidadRecibida;
      return (
        detail.cantidadEnviada > 0 &&
        received === detail.cantidadEnviada
      );
    });

    const nextState = complete ? 'RECIBIDA' : 'RECIBIDA_PARCIAL';

    const parent = await tx.transferenciaBodega.updateMany({
      where: {
        id: transferencia.id,
        version: transferencia.version,
        estado: transferencia.estado,
      },
      data: {
        estado: nextState,
        ...(complete ? { recibidaEn: operation.ocurridaEn } : {}),
        version: transferencia.version + 1,
      },
    });

    if (parent.count !== 1) {
      throw new TransferConcurrentModificationError({
        transferenciaId: transferencia.id,
      });
    }

    await tx.transferenciaBodegaOperacion.update({
      where: { id: operation.id },
      data: {
        estado: 'APLICADA',
        aplicadaEn: new Date(),
        errorAplicacion: null,
        version: { increment: 1 },
      },
    });

    const units = operation.detalles.reduce(
      (sum, line) => sum + line.cantidad,
      0,
    );

    await tx.transferenciaBodegaEvento.create({
      data: {
        transferenciaId: transferencia.id,
        usuarioId: actorId,
        tipo: 'RECEPCION_REGISTRADA',
        detalle: `Recepción #${operation.id} aplicada: ${units} unidades recibidas.`,
      },
    });

    await tx.transferenciaBodegaEvento.create({
      data: {
        transferenciaId: transferencia.id,
        usuarioId: actorId,
        tipo: nextState,
        detalle: complete
          ? 'Transferencia recibida completamente.'
          : 'Transferencia recibida parcialmente.',
      },
    });

    return {
      operacionId: operation.id,
      transferenciaId: transferencia.id,
      estadoOperacion: 'APLICADA',
      estadoTransferencia: nextState,
    };
  }

  private async persistAudit(
    tx: Prisma.TransactionClient,
    transferenciaId: number,
    audit: TransferAuditDraft,
  ): Promise<void> {
    await tx.transferenciaBodegaEvento.create({
      data: {
        transferenciaId,
        usuarioId: audit.actorId ?? null,
        tipo: audit.type,
        detalle: audit.detail ?? null,
      },
    });
  }

  private toPreparedOperation(
    row: PreparedOperationRow,
    repeated: boolean,
  ): PreparedTransferOperation {
    return {
      id: row.id,
      transferenciaId: row.transferenciaId,
      usuarioId: row.usuarioId,
      bodegaOrigenId: row.transferencia.bodegaOrigenId,
      bodegaDestinoId: row.transferencia.bodegaDestinoId,
      estadoTransferencia: row.transferencia.estado,
      tipo: row.tipo,
      estado: row.estado,
      claveIdempotencia: row.claveIdempotencia,
      documentoReferencia: row.documentoReferencia,
      observaciones: row.observaciones,
      ocurridaEn: row.ocurridaEn,
      repeated,
      detalles: row.detalles.map((line) => ({
        id: line.id,
        transferenciaDetalleId: line.transferenciaDetalleId,
        productoId: line.transferenciaDetalle.productoId,
        cantidad: line.cantidad,
        costoUnitario: line.costoUnitario?.toFixed(4) ?? null,
      })),
    };
  }

  private assertSameOperationCommand(
    row: PreparedOperationRow,
    command: PrepareTransferOperationCommand,
  ): void {
    if (
      row.transferenciaId !== command.transferenciaId ||
      row.tipo !== command.tipo
    ) {
      throw new TransferIdempotencyConflictError({
        claveIdempotencia: command.claveIdempotencia,
        existingTransferId: row.transferenciaId,
        requestedTransferId: command.transferenciaId,
        existingType: row.tipo,
        requestedType: command.tipo,
      });
    }

    if (command.tipo !== 'RECEPCION') return;

    const existing = [...row.detalles]
      .map((line) => ({
        transferenciaDetalleId: line.transferenciaDetalleId,
        cantidad: line.cantidad,
      }))
      .sort(
        (a, b) =>
          a.transferenciaDetalleId - b.transferenciaDetalleId,
      );

    const requested = [...(command.detalles ?? [])]
      .map((line) => ({
        transferenciaDetalleId: line.transferenciaDetalleId,
        cantidad: line.cantidad,
      }))
      .sort(
        (a, b) =>
          a.transferenciaDetalleId - b.transferenciaDetalleId,
      );

    const same =
      existing.length === requested.length &&
      existing.every((line, index) => {
        const other = requested[index];
        return (
          line.transferenciaDetalleId ===
            other.transferenciaDetalleId &&
          line.cantidad === other.cantidad
        );
      });

    if (!same) {
      throw new TransferIdempotencyConflictError({
        claveIdempotencia: command.claveIdempotencia,
      });
    }
  }

  private async withSerializableRetry<T>(
    work: () => Promise<T>,
    attempts = 3,
  ): Promise<T> {
    let last: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        last = error;
        const retryable =
          error instanceof TransferConcurrentModificationError ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034');

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
