import { CreditActorDirectoryPort } from '../../domain/ports/credit-actor-directory.port';
import {
  CreditPaymentPlanFrequency,
} from '../../credit.types';
import {
  CreditPaymentPlanRepositoryPort,
  CreditPaymentPlanSnapshot,
} from '../../domain/ports/credit.repositories';
import {
  CreditForbiddenError,
  CreditInvalidStateError,
  CreditNotFoundError,
  CreditValidationError,
} from '../../domain/errors/credit.errors';
import { CreditMoney } from '../../domain/value-objects/credit-money.vo';
import { requireCreditActor } from './credit.helpers';

export type CreditPaymentPlanInstallmentInput = Readonly<{
  fechaVencimiento: Date;
  montoProgramado: string;
}>;

export type CreateCreditPaymentPlanInput = Readonly<{
  creditoId: number;
  frecuencia: CreditPaymentPlanFrequency;
  cuotas: readonly CreditPaymentPlanInstallmentInput[];
  claveIdempotencia: string;
  actorId: number;
}>;

export type UpdateCreditPaymentPlanInput = Readonly<{
  creditoId: number;
  frecuencia: CreditPaymentPlanFrequency;
  cuotas: readonly CreditPaymentPlanInstallmentInput[];
  expectedVersion: number;
  claveIdempotencia: string;
  actorId: number;
}>;

export type ActivateCreditPaymentPlanInput = Readonly<{
  creditoId: number;
  expectedVersion: number;
  claveIdempotencia: string;
  actorId: number;
}>;

export class CreditPaymentPlanCommands {
  constructor(
    private readonly repository: CreditPaymentPlanRepositoryPort,
    private readonly users: CreditActorDirectoryPort,
  ) {}

  async create(input: CreateCreditPaymentPlanInput): Promise<CreditPaymentPlanSnapshot> {
    const actor = await requireCreditActor(this.users, input.actorId);
    this.assertManager(actor.rol);

    const credit = await this.repository.findCreditForPlan(input.creditoId);
    if (!credit || credit.empresaId !== actor.empresaId) {
      throw new CreditNotFoundError(input.creditoId);
    }

    this.assertCreditAllowsPlan(credit.estado, credit.montoFinanciado);
    const cuotas = this.normalizeInstallments(input.cuotas, credit.montoFinanciado!);

    return this.repository.createPaymentPlan({
      creditoId: credit.id,
      empresaId: actor.empresaId,
      frecuencia: input.frecuencia,
      cuotas,
      actorId: actor.id,
      claveIdempotencia: input.claveIdempotencia,
    });
  }

  async update(input: UpdateCreditPaymentPlanInput): Promise<CreditPaymentPlanSnapshot> {
    const actor = await requireCreditActor(this.users, input.actorId);
    this.assertManager(actor.rol);

    const credit = await this.repository.findCreditForPlan(input.creditoId);
    if (!credit || credit.empresaId !== actor.empresaId) {
      throw new CreditNotFoundError(input.creditoId);
    }

    this.assertCreditAllowsPlan(credit.estado, credit.montoFinanciado);
    const cuotas = this.normalizeInstallments(input.cuotas, credit.montoFinanciado!);

    return this.repository.updatePaymentPlan({
      creditoId: credit.id,
      empresaId: actor.empresaId,
      frecuencia: input.frecuencia,
      cuotas,
      expectedVersion: input.expectedVersion,
      actorId: actor.id,
      claveIdempotencia: input.claveIdempotencia,
    });
  }

  async activate(input: ActivateCreditPaymentPlanInput): Promise<CreditPaymentPlanSnapshot> {
    const actor = await requireCreditActor(this.users, input.actorId);
    this.assertManager(actor.rol);

    const credit = await this.repository.findCreditForPlan(input.creditoId);
    if (!credit || credit.empresaId !== actor.empresaId) {
      throw new CreditNotFoundError(input.creditoId);
    }

    this.assertCreditAllowsPlan(credit.estado, credit.montoFinanciado);

    return this.repository.activatePaymentPlan({
      creditoId: credit.id,
      empresaId: actor.empresaId,
      expectedVersion: input.expectedVersion,
      actorId: actor.id,
      claveIdempotencia: input.claveIdempotencia,
    });
  }

  private assertManager(role: string): void {
    if (!['ADMIN', 'CONTABILIDAD'].includes(role)) {
      throw new CreditForbiddenError(
        'Solo ADMIN o CONTABILIDAD pueden gestionar el plan de pagos de un crédito.',
      );
    }
  }

  private assertCreditAllowsPlan(state: string, financed: string | null): void {
    if (state !== 'ACTIVO') {
      throw new CreditInvalidStateError(state, 'gestionar plan de pagos');
    }
    if (!financed || CreditMoney.from(financed).isZero()) {
      throw new CreditValidationError(
        'El crédito no tiene un monto financiado válido para crear un plan de pagos.',
      );
    }
  }

  private normalizeInstallments(
    input: readonly CreditPaymentPlanInstallmentInput[],
    financedAmount: string,
  ) {
    if (!input.length) {
      throw new CreditValidationError('El plan debe contener al menos una cuota.');
    }
    if (input.length > 120) {
      throw new CreditValidationError('El plan no puede contener más de 120 cuotas.');
    }

    let total = CreditMoney.zero();
    let previousDueDate: Date | null = null;
    const normalized = input.map((item, index) => {
      if (!(item.fechaVencimiento instanceof Date) || Number.isNaN(item.fechaVencimiento.getTime())) {
        throw new CreditValidationError('Una fecha de vencimiento del plan es inválida.', {
          cuota: index + 1,
        });
      }

      if (
        previousDueDate &&
        item.fechaVencimiento.getTime() < previousDueDate.getTime()
      ) {
        throw new CreditValidationError(
          'Las cuotas deben estar ordenadas por fecha de vencimiento.',
          { cuota: index + 1 },
        );
      }
      previousDueDate = item.fechaVencimiento;

      const amount = CreditMoney.from(item.montoProgramado);
      if (amount.isZero()) {
        throw new CreditValidationError('Cada cuota debe tener un monto mayor que cero.', {
          cuota: index + 1,
        });
      }
      total = total.add(amount);

      return {
        numero: index + 1,
        fechaVencimiento: item.fechaVencimiento,
        montoProgramado: amount.toString(),
      };
    });

    const financed = CreditMoney.from(financedAmount);
    if (!total.equals(financed)) {
      throw new CreditValidationError(
        'La suma de las cuotas debe coincidir exactamente con el monto financiado.',
        {
          montoFinanciado: financed.toString(),
          montoProgramado: total.toString(),
        },
      );
    }

    return normalized;
  }
}
