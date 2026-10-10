import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  CreditConcurrentModificationError,
  CreditIdempotencyConflictError,
  CreditInvalidStateError,
  CreditNotFoundError,
  CreditPaymentPlanExistsError,
  CreditPaymentPlanNotFoundError,
  CreditValidationError,
} from '../../../domain/errors/credit.errors';
import {
  CreditPaymentPlanRepositoryPort,
  CreditPaymentPlanSnapshot,
} from '../../../domain/ports/credit.repositories';
import { CreditMoney } from '../../../domain/value-objects/credit-money.vo';

@Injectable()
export class CreditPaymentPlanPrismaRepository
  implements CreditPaymentPlanRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findCreditForPlan(creditoId: number) {
    const row = await this.prisma.credito.findUnique({
      where: { id: creditoId },
      select: {
        id: true,
        empresaId: true,
        clienteId: true,
        numero: true,
        estado: true,
        montoFinanciado: true,
        solicitudOrigen: {
          select: {
            pedidoId: true,
            pedido: { select: { moneda: true, estado: true } },
          },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      empresaId: row.empresaId,
      clienteId: row.clienteId,
      numero: row.numero,
      estado: String(row.estado),
      montoFinanciado: row.montoFinanciado?.toFixed(2) ?? null,
      pedidoId: row.solicitudOrigen?.pedidoId ?? null,
      moneda: row.solicitudOrigen?.pedido.moneda ?? 'GTQ',
    };
  }

  async createPaymentPlan(input: Parameters<CreditPaymentPlanRepositoryPort['createPaymentPlan']>[0]) {
    const repeated = await this.prisma.creditoPlanPago.findUnique({
      where: { claveIdempotenciaCreacion: input.claveIdempotencia },
      include: { cuotas: { orderBy: { numero: 'asc' } } },
    });

    if (repeated) {
      if (repeated.creditoId !== input.creditoId) {
        throw new CreditIdempotencyConflictError(input.claveIdempotencia);
      }
      return this.toSnapshot(repeated);
    }

    const existing = await this.prisma.creditoPlanPago.findUnique({
      where: { creditoId: input.creditoId },
      select: { id: true },
    });
    if (existing) {
      throw new CreditPaymentPlanExistsError(input.creditoId, existing.id);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.creditoPlanPago.create({
          data: {
            empresaId: input.empresaId,
            creditoId: input.creditoId,
            estado: 'BORRADOR',
            frecuencia: input.frecuencia,
            montoProgramado: this.sum(input.cuotas),
            numeroCuotas: input.cuotas.length,
            primeraFechaVencimiento: input.cuotas[0].fechaVencimiento,
            creadoPorId: input.actorId,
            claveIdempotenciaCreacion: input.claveIdempotencia,
            cuotas: {
              create: input.cuotas.map((cuota) => ({
                numero: cuota.numero,
                montoProgramado: new Prisma.Decimal(cuota.montoProgramado),
                fechaVencimiento: cuota.fechaVencimiento,
              })),
            },
          },
        });

        await tx.creditoPlanPagoEvento.create({
          data: {
            planPagoId: plan.id,
            usuarioId: input.actorId,
            tipo: 'CREADO',
            estado: 'BORRADOR',
            detalle: 'Plan de pagos creado en borrador.',
            claveIdempotencia: input.claveIdempotencia + ':EVENT',
            metadata: {
              frecuencia: input.frecuencia,
              numeroCuotas: input.cuotas.length,
              montoProgramado: this.sum(input.cuotas),
            },
          },
        });

        const persisted = await tx.creditoPlanPago.findUniqueOrThrow({
          where: { id: plan.id },
          include: { cuotas: { orderBy: { numero: 'asc' } } },
        });
        return this.toSnapshot(persisted);
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new CreditPaymentPlanExistsError(input.creditoId);
      }
      throw error;
    }
  }

  async updatePaymentPlan(input: Parameters<CreditPaymentPlanRepositoryPort['updatePaymentPlan']>[0]) {
    const repeatedEvent = await this.prisma.creditoPlanPagoEvento.findUnique({
      where: { claveIdempotencia: input.claveIdempotencia },
      include: { planPago: { include: { cuotas: { orderBy: { numero: 'asc' } } } } },
    });

    if (repeatedEvent) {
      if (repeatedEvent.planPago.creditoId !== input.creditoId || repeatedEvent.tipo !== 'ACTUALIZADO') {
        throw new CreditIdempotencyConflictError(input.claveIdempotencia);
      }
      return this.toSnapshot(repeatedEvent.planPago);
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.creditoPlanPago.findUnique({
        where: { creditoId: input.creditoId },
      });
      if (!plan || plan.empresaId !== input.empresaId) {
        throw new CreditPaymentPlanNotFoundError(input.creditoId);
      }
      if (plan.estado !== 'BORRADOR') {
        throw new CreditInvalidStateError(plan.estado, 'editar plan de pagos');
      }
      if (plan.version !== input.expectedVersion) {
        throw new CreditConcurrentModificationError({
          creditoId: input.creditoId,
          expectedVersion: input.expectedVersion,
        });
      }

      const changed = await tx.creditoPlanPago.updateMany({
        where: {
          id: plan.id,
          version: input.expectedVersion,
          estado: 'BORRADOR',
        },
        data: {
          frecuencia: input.frecuencia,
          montoProgramado: new Prisma.Decimal(this.sum(input.cuotas)),
          numeroCuotas: input.cuotas.length,
          primeraFechaVencimiento: input.cuotas[0].fechaVencimiento,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new CreditConcurrentModificationError({ creditoId: input.creditoId });
      }

      await tx.creditoCuota.deleteMany({ where: { planPagoId: plan.id } });
      await tx.creditoCuota.createMany({
        data: input.cuotas.map((cuota) => ({
          planPagoId: plan.id,
          numero: cuota.numero,
          montoProgramado: new Prisma.Decimal(cuota.montoProgramado),
          fechaVencimiento: cuota.fechaVencimiento,
        })),
      });

      await tx.creditoPlanPagoEvento.create({
        data: {
          planPagoId: plan.id,
          usuarioId: input.actorId,
          tipo: 'ACTUALIZADO',
          estado: 'BORRADOR',
          detalle: 'Plan de pagos actualizado.',
          claveIdempotencia: input.claveIdempotencia,
          metadata: {
            frecuencia: input.frecuencia,
            numeroCuotas: input.cuotas.length,
            montoProgramado: this.sum(input.cuotas),
          },
        },
      });

      const persisted = await tx.creditoPlanPago.findUniqueOrThrow({
        where: { id: plan.id },
        include: { cuotas: { orderBy: { numero: 'asc' } } },
      });
      return this.toSnapshot(persisted);
    });
  }

  async activatePaymentPlan(input: Parameters<CreditPaymentPlanRepositoryPort['activatePaymentPlan']>[0]) {
    const repeated = await this.prisma.creditoPlanPago.findUnique({
      where: { claveIdempotenciaActivacion: input.claveIdempotencia },
      include: { cuotas: { orderBy: { numero: 'asc' } } },
    });

    if (repeated) {
      if (repeated.creditoId !== input.creditoId) {
        throw new CreditIdempotencyConflictError(input.claveIdempotencia);
      }
      return this.toSnapshot(repeated);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const credit = await tx.credito.findUnique({
          where: { id: input.creditoId },
          select: {
            id: true,
            empresaId: true,
            clienteId: true,
            numero: true,
            estado: true,
            montoFinanciado: true,
            anticipoRequerido: true,
            solicitudOrigen: {
              select: {
                pedidoId: true,
                pedido: { select: { moneda: true, estado: true, condicionPago: true } },
              },
            },
          },
        });

        if (!credit || credit.empresaId !== input.empresaId) {
          throw new CreditNotFoundError(input.creditoId);
        }
        if (credit.estado !== 'ACTIVO') {
          throw new CreditInvalidStateError(credit.estado, 'activar plan de pagos');
        }
        if (!credit.clienteId || !credit.empresaId || !credit.solicitudOrigen) {
          throw new CreditValidationError(
            'El crédito no tiene empresa, cliente o pedido de origen válidos.',
          );
        }
        if (credit.solicitudOrigen.pedido.condicionPago === 'MIXTO') {
          const expectedAdvance = CreditMoney.from(
            credit.anticipoRequerido?.toFixed(2) ?? '0.00',
          );
          const advanceAccount = await tx.cuentaPorCobrar.findUnique({
            where: {
              claveIdempotencia: 'credit-advance:order:' + credit.solicitudOrigen.pedidoId,
            },
          });
          if (expectedAdvance.isZero() ||
              !advanceAccount ||
              advanceAccount.empresaId !== credit.empresaId ||
              advanceAccount.clienteId !== credit.clienteId ||
              advanceAccount.pedidoId !== credit.solicitudOrigen.pedidoId ||
              !CreditMoney.from(advanceAccount.montoOriginal.toFixed(2)).equals(expectedAdvance) ||
              advanceAccount.estado !== 'PAGADA' ||
              !CreditMoney.from(advanceAccount.saldoPendiente.toFixed(2)).isZero()) {
            throw new CreditValidationError(
              'El anticipo del pedido MIXTO debe estar cobrado, verificado y aplicado antes de activar sus cuotas.',
              { pedidoId: credit.solicitudOrigen.pedidoId, anticipoRequerido: expectedAdvance.toString() },
            );
          }
        }

        // Activación financiera manual; no condicionada al despacho ni a la entrega.
        const plan = await tx.creditoPlanPago.findUnique({
          where: { creditoId: credit.id },
          include: { cuotas: { orderBy: { numero: 'asc' } } },
        });
        if (!plan) throw new CreditPaymentPlanNotFoundError(credit.id);
        if (plan.estado !== 'BORRADOR') {
          throw new CreditInvalidStateError(plan.estado, 'activar plan de pagos');
        }
        if (plan.version !== input.expectedVersion) {
          throw new CreditConcurrentModificationError({
            creditoId: credit.id,
            expectedVersion: input.expectedVersion,
          });
        }
        if (!plan.cuotas.length) {
          throw new CreditValidationError('El plan no contiene cuotas.');
        }

        const financed = CreditMoney.from(credit.montoFinanciado?.toFixed(2) ?? '0.00');
        const programmed = CreditMoney.from(plan.montoProgramado.toFixed(2));
        if (financed.isZero() || !programmed.equals(financed)) {
          throw new CreditValidationError(
            'El monto programado ya no coincide con el monto financiado del crédito.',
            {
              montoFinanciado: financed.toString(),
              montoProgramado: programmed.toString(),
            },
          );
        }

        const existingReceivables = await tx.cuentaPorCobrar.count({
          where: {
            creditoId: credit.id,
            estado: { not: 'ANULADA' },
          },
        });
        if (existingReceivables > 0) {
          throw new CreditValidationError(
            'El crédito ya tiene cuentas por cobrar activas. No se puede activar otro origen de deuda.',
            { creditoId: credit.id, cuentasExistentes: existingReceivables },
          );
        }

        const prefix = credit.numero ?? `CRE-${String(credit.id).padStart(6, '0')}`;
        const now = new Date();

        for (const cuota of plan.cuotas) {
          const account = await tx.cuentaPorCobrar.create({
            data: {
              empresaId: credit.empresaId,
              clienteId: credit.clienteId,
              pedidoId: credit.solicitudOrigen.pedidoId,
              creditoId: credit.id,
              numeroDocumento:
                prefix + '-C' + String(cuota.numero).padStart(3, '0'),
              moneda: credit.solicitudOrigen.pedido.moneda,
              montoOriginal: cuota.montoProgramado,
              saldoPendiente: cuota.montoProgramado,
              fechaEmision: now,
              fechaVencimiento: cuota.fechaVencimiento,
              estado:
                cuota.fechaVencimiento.getTime() < now.getTime()
                  ? 'VENCIDA'
                  : 'PENDIENTE',
              claveIdempotencia:
                'credit-plan:' + plan.id + ':installment:' + cuota.numero,
            },
          });

          await tx.creditoCuota.update({
            where: { id: cuota.id },
            data: { cuentaPorCobrarId: account.id },
          });
        }

        const changed = await tx.creditoPlanPago.updateMany({
          where: {
            id: plan.id,
            version: input.expectedVersion,
            estado: 'BORRADOR',
          },
          data: {
            estado: 'ACTIVO',
            activadoPorId: input.actorId,
            activadoEn: now,
            claveIdempotenciaActivacion: input.claveIdempotencia,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new CreditConcurrentModificationError({ creditoId: credit.id });
        }

        await tx.creditoPlanPagoEvento.create({
          data: {
            planPagoId: plan.id,
            usuarioId: input.actorId,
            tipo: 'ACTIVADO',
            estado: 'ACTIVO',
            detalle: 'Plan de pagos activado y cuentas por cobrar generadas.',
            claveIdempotencia: input.claveIdempotencia + ':EVENT',
            metadata: {
              numeroCuotas: plan.numeroCuotas,
              montoProgramado: plan.montoProgramado.toFixed(2),
            },
          },
        });

        const persisted = await tx.creditoPlanPago.findUniqueOrThrow({
          where: { id: plan.id },
          include: { cuotas: { orderBy: { numero: 'asc' } } },
        });
        return this.toSnapshot(persisted);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private sum(cuotas: readonly { montoProgramado: string }[]): string {
    return cuotas
      .reduce(
        (total, cuota) => total.plus(new Prisma.Decimal(cuota.montoProgramado)),
        new Prisma.Decimal(0),
      )
      .toFixed(2);
  }

  private toSnapshot(row: any): CreditPaymentPlanSnapshot {
    return {
      id: row.id,
      empresaId: row.empresaId,
      creditoId: row.creditoId,
      estado: row.estado,
      frecuencia: row.frecuencia,
      montoProgramado: row.montoProgramado.toFixed(2),
      numeroCuotas: row.numeroCuotas,
      primeraFechaVencimiento: row.primeraFechaVencimiento,
      version: row.version,
      activadoEn: row.activadoEn,
      cuotas: row.cuotas.map((cuota: any) => ({
        id: cuota.id,
        numero: cuota.numero,
        montoProgramado: cuota.montoProgramado.toFixed(2),
        fechaVencimiento: cuota.fechaVencimiento,
        cuentaPorCobrarId: cuota.cuentaPorCobrarId,
      })),
    };
  }
}
