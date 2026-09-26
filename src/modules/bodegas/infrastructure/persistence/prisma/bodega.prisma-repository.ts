import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { BodegaAuditDraft } from '../../../domain/bodega.types';
import { Bodega } from '../../../domain/entities/bodega.entity';
import { BodegaRepositoryPort } from '../../../domain/ports/bodega.repository.port';
import { BodegaPrismaMapper } from './bodega.prisma-mapper';

@Injectable()
export class BodegaPrismaRepository implements BodegaRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<Bodega | null> {
    const row = await this.prisma.bodega.findUnique({ where: { id } });
    return row ? BodegaPrismaMapper.toDomain(row) : null;
  }

  async findPrincipal(): Promise<Bodega | null> {
    const row = await this.prisma.bodega.findFirst({
      where: { esPrincipal: true },
      orderBy: { id: 'asc' },
    });
    return row ? BodegaPrismaMapper.toDomain(row) : null;
  }

  async existsByCode(code: string, excludeId?: number): Promise<boolean> {
    const count = await this.prisma.bodega.count({
      where: {
        codigo: code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    return count > 0;
  }

  async create(
    bodega: Bodega,
    audits: readonly BodegaAuditDraft[],
  ): Promise<Bodega> {
    return this.prisma.$transaction(async (tx) => {
      if (bodega.esPrincipal) {
        await tx.bodega.updateMany({
          where: { esPrincipal: true },
          data: { esPrincipal: false },
        });
      }

      const created = await tx.bodega.create({
        data: BodegaPrismaMapper.toCreateInput(bodega),
      });

      await this.persistAudits(tx, created.id, audits);
      return BodegaPrismaMapper.toDomain(created);
    });
  }

  async update(
    bodega: Bodega,
    audits: readonly BodegaAuditDraft[],
  ): Promise<Bodega> {
    if (!bodega.id) {
      throw new Error('No se puede actualizar una bodega sin id.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bodega.update({
        where: { id: bodega.id },
        data: BodegaPrismaMapper.toUpdateInput(bodega),
      });

      await this.persistAudits(tx, updated.id, audits);
      return BodegaPrismaMapper.toDomain(updated);
    });
  }

  async setPrincipal(
    bodegaId: number,
    audit: BodegaAuditDraft,
  ): Promise<Bodega> {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.bodega.findFirst({
        where: { esPrincipal: true },
        select: { id: true },
      });

      await tx.bodega.updateMany({
        where: { esPrincipal: true, id: { not: bodegaId } },
        data: { esPrincipal: false },
      });

      const updated = await tx.bodega.update({
        where: { id: bodegaId },
        data: { esPrincipal: true },
      });

      await this.persistAudits(tx, bodegaId, [
        {
          ...audit,
          metadata: {
            ...(audit.metadata ?? {}),
            principalAnteriorId:
              previous?.id && previous.id !== bodegaId ? previous.id : null,
          },
        },
      ]);

      return BodegaPrismaMapper.toDomain(updated);
    });
  }

  private async persistAudits(
    tx: Prisma.TransactionClient,
    bodegaId: number,
    audits: readonly BodegaAuditDraft[],
  ): Promise<void> {
    for (const audit of audits) {
      await tx.bodegaEvento.create({
        data: {
          bodegaId,
          usuarioId: audit.actorId ?? null,
          tipo: audit.type,
          detalle: audit.detail ?? null,
          metadata: audit.metadata
            ? (audit.metadata as Prisma.InputJsonValue)
            : undefined,
        },
      });
    }
  }
}
