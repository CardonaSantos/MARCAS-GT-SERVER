import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  PaymentBankNotFoundError,
  PaymentValidationError,
} from '../../../domain/errors/payment.errors';
import {
  PaymentBankRepositoryPort,
  PaymentBankSnapshot,
} from '../../../application/ports/payment-bank.port';

@Injectable()
export class PaymentBankPrismaRepository
  implements PaymentBankRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: Parameters<PaymentBankRepositoryPort['create']>[0],
  ): Promise<PaymentBankSnapshot> {
    await this.assertUniqueName(input.empresaId, input.nombre);

    return this.prisma.banco.create({
      data: {
        empresaId: input.empresaId,
        nombre: input.nombre,
        codigo: input.codigo ?? null,
        cuenta: input.cuenta ?? null,
        activo: input.activo,
      },
    });
  }

  async update(
    input: Parameters<PaymentBankRepositoryPort['update']>[0],
  ): Promise<PaymentBankSnapshot> {
    const existing = await this.prisma.banco.findFirst({
      where: {
        id: input.id,
        empresaId: input.empresaId,
      },
    });

    if (!existing) {
      throw new PaymentBankNotFoundError(input.id);
    }

    if (
      input.nombre !== undefined &&
      input.nombre.trim().toLocaleLowerCase() !==
        existing.nombre.trim().toLocaleLowerCase()
    ) {
      await this.assertUniqueName(input.empresaId, input.nombre, input.id);
    }

    return this.prisma.banco.update({
      where: { id: input.id },
      data: {
        ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
        ...(input.codigo !== undefined ? { codigo: input.codigo } : {}),
        ...(input.cuenta !== undefined ? { cuenta: input.cuenta } : {}),
        ...(input.activo !== undefined ? { activo: input.activo } : {}),
      },
    });
  }

  private async assertUniqueName(
    empresaId: number,
    nombre: string,
    excludeId?: number,
  ): Promise<void> {
    const duplicate = await this.prisma.banco.findFirst({
      where: {
        empresaId,
        nombre: {
          equals: nombre.trim(),
          mode: 'insensitive',
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new PaymentValidationError(
        'Ya existe un banco con ese nombre para la empresa.',
        { bancoId: duplicate.id },
      );
    }
  }
}
