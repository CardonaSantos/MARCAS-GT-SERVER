import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { CreditPolicy } from '../../../domain/entities/credit-policy.entity';
import { CreditConcurrentModificationError } from '../../../domain/errors/credit.errors';
import {
  CreditPolicyEntry,
  CreditPolicyRepositoryPort,
} from '../../../domain/ports/credit.repositories';

@Injectable()
export class CreditPolicyPrismaRepository implements CreditPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findPolicyById(id: number): Promise<CreditPolicyEntry | null> {
    const row = await this.prisma.politicaCredito.findUnique({
      where: { id },
      include: {
        requisitos: {
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
        },
      },
    });
    return row ? this.map(row) : null;
  }

  async createPolicy(entity: CreditPolicy): Promise<CreditPolicyEntry> {
    const row = await this.prisma.politicaCredito.create({
      data: {
        empresaId: entity.empresaId,
        nombre: entity.nombre,
        descripcion: entity.descripcion,
        activo: entity.activo,
        montoMaximo:
          entity.montoMaximo == null
            ? null
            : new Prisma.Decimal(entity.montoMaximo),
        plazoMaximoDias: entity.plazoMaximoDias,
        porcentajeAnticipo:
          entity.porcentajeAnticipo == null
            ? null
            : new Prisma.Decimal(entity.porcentajeAnticipo),
        version: entity.version,
        requisitos: {
          create: entity.requisitos.map((r) => ({
            codigo: r.codigo,
            nombre: r.nombre,
            descripcion: r.descripcion ?? null,
            obligatorio: r.obligatorio ?? true,
            orden: r.orden ?? 0,
            activo: r.activo ?? true,
            version: 0,
          })),
        },
      },
      include: { requisitos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] } },
    });
    return this.map(row);
  }

  async updatePolicy(
    entity: CreditPolicy,
    expectedVersion: number,
    replaceRequirements: boolean,
  ): Promise<CreditPolicyEntry> {
    if (!entity.id) throw new Error('Política sin id.');

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.politicaCredito.updateMany({
        where: { id: entity.id!, version: expectedVersion },
        data: {
          nombre: entity.nombre,
          descripcion: entity.descripcion,
          montoMaximo:
            entity.montoMaximo == null
              ? null
              : new Prisma.Decimal(entity.montoMaximo),
          plazoMaximoDias: entity.plazoMaximoDias,
          porcentajeAnticipo:
            entity.porcentajeAnticipo == null
              ? null
              : new Prisma.Decimal(entity.porcentajeAnticipo),
          version: entity.version,
        },
      });
      if (result.count !== 1) {
        throw new CreditConcurrentModificationError({
          id: entity.id,
          expectedVersion,
        });
      }

      if (replaceRequirements) {
        // No borra requisitos que ya estén referenciados por snapshots históricos.
        // Los existentes se inactivan y se hace upsert por código.
        await tx.politicaCreditoRequisito.updateMany({
          where: { politicaId: entity.id },
          data: { activo: false, version: { increment: 1 } },
        });

        for (const requirement of entity.requisitos) {
          await tx.politicaCreditoRequisito.upsert({
            where: {
              politicaId_codigo: {
                politicaId: entity.id,
                codigo: requirement.codigo,
              },
            },
            update: {
              nombre: requirement.nombre,
              descripcion: requirement.descripcion ?? null,
              obligatorio: requirement.obligatorio ?? true,
              orden: requirement.orden ?? 0,
              activo: requirement.activo ?? true,
              version: { increment: 1 },
            },
            create: {
              politicaId: entity.id,
              codigo: requirement.codigo,
              nombre: requirement.nombre,
              descripcion: requirement.descripcion ?? null,
              obligatorio: requirement.obligatorio ?? true,
              orden: requirement.orden ?? 0,
              activo: requirement.activo ?? true,
              version: 0,
            },
          });
        }
      }

      const row = await tx.politicaCredito.findUniqueOrThrow({
        where: { id: entity.id },
        include: { requisitos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] } },
      });
      return this.map(row);
    });
  }

  async setPolicyStatus(
    entity: CreditPolicy,
    expectedVersion: number,
  ): Promise<CreditPolicyEntry> {
    if (!entity.id) throw new Error('Política sin id.');
    const result = await this.prisma.politicaCredito.updateMany({
      where: { id: entity.id, version: expectedVersion },
      data: {
        activo: entity.activo,
        motivoInactivacion: entity.motivoInactivacion,
        inactivadaEn: entity.inactivadaEn,
        version: entity.version,
      },
    });
    if (result.count !== 1) {
      throw new CreditConcurrentModificationError({
        id: entity.id,
        expectedVersion,
      });
    }
    const row = await this.prisma.politicaCredito.findUniqueOrThrow({
      where: { id: entity.id },
      include: { requisitos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] } },
    });
    return this.map(row);
  }

  private map(row: any): CreditPolicyEntry {
    return {
      id: row.id,
      empresaId: row.empresaId,
      nombre: row.nombre,
      descripcion: row.descripcion,
      activo: row.activo,
      montoMaximo: row.montoMaximo?.toFixed(2) ?? null,
      plazoMaximoDias: row.plazoMaximoDias,
      porcentajeAnticipo: row.porcentajeAnticipo?.toFixed(2) ?? null,
      version: row.version,
      requisitos: row.requisitos.map((r: any) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        descripcion: r.descripcion,
        obligatorio: r.obligatorio,
        orden: r.orden,
        activo: r.activo,
      })),
    };
  }
}
