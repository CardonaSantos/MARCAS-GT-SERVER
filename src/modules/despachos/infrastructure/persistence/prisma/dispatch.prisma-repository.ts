import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { OrdenDespacho } from '../../../domain/entities/dispatch-order.entity';
import {
  DispatchConcurrentModificationError,
  DispatchIdempotencyConflictError,
} from '../../../domain/errors/dispatch.errors';
import {
  DispatchRepositoryPort,
  DispatchSaveOptions,
} from '../../../domain/ports/dispatch.repository.port';
import { DispatchAuditDraft } from '../../../dispatch.types';
import {
  DISPATCH_WITH_DETAILS,
  DispatchPrismaMapper,
} from './dispatch.prisma-mapper';

@Injectable()
export class DispatchPrismaRepository implements DispatchRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const row = await this.prisma.ordenDespacho.findUnique({
      where: { id },
      include: DISPATCH_WITH_DETAILS,
    });
    return row ? DispatchPrismaMapper.toDomain(row) : null;
  }

  async create(
    entity: OrdenDespacho,
    audit: DispatchAuditDraft,
  ): Promise<OrdenDespacho> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ordenDespacho.create({
        data: {
          pedidoId: entity.pedidoId,
          bodegaId: entity.bodegaId,
          creadoPorId: entity.creadoPorId,
          estado: entity.estado,
          programadoEn: entity.programadoEn,
          observaciones: entity.observaciones,
          version: entity.version,
          detalles: {
            create: entity.detalles.map((detail) => ({
              pedidoDetalleId: detail.pedidoDetalleId,
              productoId: detail.productoId,
              cantidadProgramada: detail.cantidadProgramada,
              cantidadPreparada: detail.cantidadPreparada ?? 0,
              cantidadDespachada: detail.cantidadDespachada ?? 0,
              observaciones: detail.observaciones ?? null,
              version: detail.version ?? 0,
            })),
          },
        },
      });

      await tx.ordenDespacho.update({
        where: { id: row.id },
        data: { numero: `DSP-${String(row.id).padStart(6, '0')}` },
      });

      await this.persistAudit(tx, row.id, audit);

      const persisted = await tx.ordenDespacho.findUniqueOrThrow({
        where: { id: row.id },
        include: DISPATCH_WITH_DETAILS,
      });
      return DispatchPrismaMapper.toDomain(persisted);
    });
  }

  async save(
    entity: OrdenDespacho,
    expectedVersion: number,
    audits: readonly DispatchAuditDraft[] = [],
    options?: DispatchSaveOptions,
  ): Promise<OrdenDespacho> {
    if (!entity.id) throw new Error('No se puede guardar un despacho sin id.');

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.ordenDespacho.updateMany({
        where: { id: entity.id!, version: expectedVersion },
        data: {
          bodegaId: entity.bodegaId,
          estado: entity.estado,
          programadoEn: entity.programadoEn,
          preparacionIniciadaEn: entity.preparacionIniciadaEn,
          preparadoEn: entity.preparadoEn,
          despachadoEn: entity.despachadoEn,
          canceladoEn: entity.canceladoEn,
          preparadoPorId: entity.preparadoPorId,
          despachadoPorId: entity.despachadoPorId,
          canceladoPorId: entity.canceladoPorId,
          motivoCancelacion: entity.motivoCancelacion,
          observaciones: entity.observaciones,
          version: entity.version,
        },
      });

      if (changed.count !== 1) {
        throw new DispatchConcurrentModificationError({
          id: entity.id,
          expectedVersion,
        });
      }

      if (options?.replaceDetails) {
        await tx.ordenDespachoDetalle.deleteMany({
          where: { ordenDespachoId: entity.id },
        });
        await tx.ordenDespachoDetalle.createMany({
          data: entity.detalles.map((detail) => ({
            ordenDespachoId: entity.id!,
            pedidoDetalleId: detail.pedidoDetalleId,
            productoId: detail.productoId,
            cantidadProgramada: detail.cantidadProgramada,
            cantidadPreparada: detail.cantidadPreparada ?? 0,
            cantidadDespachada: detail.cantidadDespachada ?? 0,
            observaciones: detail.observaciones ?? null,
            version: detail.version ?? 0,
          })),
        });
      } else {
        for (const detail of entity.detalles) {
          if (!detail.id) {
            throw new Error('No se puede actualizar una línea persistida sin id.');
          }

          const persisted = await tx.ordenDespachoDetalle.findUnique({
            where: { id: detail.id },
          });
          if (!persisted || persisted.ordenDespachoId !== entity.id) {
            throw new DispatchConcurrentModificationError({
              detalleId: detail.id,
            });
          }

          const targetVersion = detail.version ?? 0;
          const sameValues =
            persisted.cantidadProgramada === detail.cantidadProgramada &&
            persisted.cantidadPreparada === (detail.cantidadPreparada ?? 0) &&
            persisted.cantidadDespachada === (detail.cantidadDespachada ?? 0) &&
            persisted.observaciones === (detail.observaciones ?? null);

          // Línea no tocada por el dominio: no hacemos UPDATE.
          if (persisted.version === targetVersion) {
            if (!sameValues) {
              throw new DispatchConcurrentModificationError({
                detalleId: detail.id,
                reason: 'La línea cambió sin avanzar su versión.',
              });
            }
            continue;
          }

          // Línea modificada por el dominio: su versión debe avanzar exactamente 1.
          if (persisted.version !== targetVersion - 1) {
            throw new DispatchConcurrentModificationError({
              detalleId: detail.id,
              persistedVersion: persisted.version,
              targetVersion,
            });
          }

          const changedDetail = await tx.ordenDespachoDetalle.updateMany({
            where: {
              id: detail.id,
              version: persisted.version,
            },
            data: {
              cantidadProgramada: detail.cantidadProgramada,
              cantidadPreparada: detail.cantidadPreparada ?? 0,
              cantidadDespachada: detail.cantidadDespachada ?? 0,
              observaciones: detail.observaciones ?? null,
              version: targetVersion,
            },
          });

          if (changedDetail.count !== 1) {
            throw new DispatchConcurrentModificationError({
              detalleId: detail.id,
            });
          }
        }
      }

      for (const audit of audits) {
        await this.persistAudit(tx, entity.id, audit);
      }

      const persisted = await tx.ordenDespacho.findUniqueOrThrow({
        where: { id: entity.id },
        include: DISPATCH_WITH_DETAILS,
      });
      return DispatchPrismaMapper.toDomain(persisted);
    });
  }

  async hasOperations(id: number): Promise<boolean> {
    return (
      (await this.prisma.operacionDespacho.count({
        where: { ordenDespachoId: id },
      })) > 0
    );
  }

  async activeProgrammedByOrderDetail(
    pedidoId: number,
    excludeDispatchId?: number,
  ): Promise<Map<number, number>> {
    const rows = await this.prisma.ordenDespachoDetalle.findMany({
      where: {
        ordenDespacho: {
          is: {
            pedidoId,
            estado: { not: 'CANCELADA' },
            ...(excludeDispatchId ? { id: { not: excludeDispatchId } } : {}),
          },
        },
      },
      select: {
        pedidoDetalleId: true,
        cantidadProgramada: true,
      },
    });

    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(
        row.pedidoDetalleId,
        (map.get(row.pedidoDetalleId) ?? 0) + row.cantidadProgramada,
      );
    }
    return map;
  }

  appendEvent(
    dispatchId: number,
    audit: DispatchAuditDraft,
  ): Promise<void> {
    return this.prisma.$transaction((tx) =>
      this.persistAudit(tx, dispatchId, audit),
    );
  }

  private async persistAudit(
    tx: Prisma.TransactionClient,
    dispatchId: number,
    audit: DispatchAuditDraft,
  ): Promise<void> {
    const key = audit.claveIdempotencia?.trim() || null;

    if (key) {
      const existing = await tx.ordenDespachoEvento.findUnique({
        where: { claveIdempotencia: key },
        select: { id: true, ordenDespachoId: true },
      });
      if (existing) {
        if (existing.ordenDespachoId !== dispatchId) {
          throw new DispatchIdempotencyConflictError({
            claveIdempotencia: key,
            existingDispatchId: existing.ordenDespachoId,
            requestedDispatchId: dispatchId,
          });
        }
        return;
      }
    }

    await tx.ordenDespachoEvento.create({
      data: {
        ordenDespachoId: dispatchId,
        usuarioId: audit.actorId ?? null,
        tipo: audit.tipo,
        detalle: audit.detalle ?? null,
        referenciaTipo: audit.referencia?.tipo ?? null,
        referenciaId: audit.referencia?.id ?? null,
        metadata: audit.metadata
          ? (audit.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        claveIdempotencia: key,
      },
    });
  }
}
