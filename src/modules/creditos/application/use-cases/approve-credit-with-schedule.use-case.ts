import { CreditApplicationRepositoryPort, CreditPaymentPlanSnapshot } from '../../domain/ports/credit.repositories';
import { CreditActorDirectoryPort } from '../../domain/ports/credit-actor-directory.port';
import { CreditForbiddenError, CreditValidationError } from '../../domain/errors/credit.errors';
import { requireCreditActor } from './credit.helpers';
import { CreditDecisionCommands } from './credit-decision.commands';
import { CreditPaymentPlanCommands } from './credit-payment-plan.commands';

export type CreditScheduleInput = {
  frecuencia: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
  numeroCuotas: number;
  primeraFechaVencimiento: Date;
};

/**
 * Resuelve la autorización y deja su calendario en borrador con una acción.
 * Si falla la segunda etapa, reintentar la MISMA acción recupera el plan
 * sobre el crédito aprobado, sin crear otro crédito.
 */
export class ApproveCreditWithScheduleUseCase {
  constructor(
    private readonly applications: CreditApplicationRepositoryPort,
    private readonly actors: CreditActorDirectoryPort,
    private readonly decisions: CreditDecisionCommands,
    private readonly plans: CreditPaymentPlanCommands,
  ) {}

  async execute(input: {
    id: number;
    actorId: number;
    montoAutorizado: string;
    plazoAutorizadoDias: number;
    anticipoRequerido: string;
    observaciones?: string | null;
    claveIdempotencia: string;
    plan: CreditScheduleInput;
  }): Promise<{ creditoId: number; plan: CreditPaymentPlanSnapshot; integracion: unknown }> {
    const actor = await requireCreditActor(this.actors, input.actorId);
    if (actor.rol !== 'ADMIN') {
      throw new CreditForbiddenError('Solo ADMIN puede aprobar y programar un crédito.');
    }
    const app = await this.applications.findById(input.id);
    if (!app || app.empresaId !== actor.empresaId) {
      throw new CreditForbiddenError('La solicitud no pertenece a la empresa activa.');
    }

    const count = input.plan.numeroCuotas;
    if (!Number.isInteger(count) || count < 1 || count > 120) {
      throw new CreditValidationError('El número de cuotas debe estar entre 1 y 120.');
    }
    const date = input.plan.primeraFechaVencimiento;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new CreditValidationError('Selecciona una fecha válida para la primera cuota.');
    }
    const authorizedCents = toCents(input.montoAutorizado);
    const advanceCents = toCents(input.anticipoRequerido);
    const financedCents = authorizedCents - advanceCents;
    if (financedCents < count) {
      throw new CreditValidationError('Cada cuota debe tener un monto positivo.');
    }

    const cuotaBase = Math.floor(financedCents / count);
    const residuo = financedCents % count;
    const installments = Array.from({ length: count }, (_, index) => {
      const due = new Date(date);
      if (input.plan.frecuencia === 'MENSUAL') {
        const originalDay = due.getUTCDate();
        due.setUTCDate(1);
        due.setUTCMonth(due.getUTCMonth() + index);
        const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
        due.setUTCDate(Math.min(originalDay, lastDay));
      } else {
        due.setUTCDate(due.getUTCDate() + index *
          (input.plan.frecuencia === 'SEMANAL' ? 7 : 15));
      }
      return {
        fechaVencimiento: due,
        montoProgramado: fromCents(cuotaBase + (index === count - 1 ? residuo : 0)),
      };
    });

    let creditoId = app.creditoId;
    let integracion: unknown = null;
    if (app.estado === 'EN_REVISION') {
      const approval = await this.decisions.approve({
        id: input.id,
        actorId: actor.id,
        montoAutorizado: input.montoAutorizado,
        plazoAutorizadoDias: input.plazoAutorizadoDias,
        anticipoRequerido: input.anticipoRequerido,
        observaciones: input.observaciones,
        claveIdempotencia: input.claveIdempotencia,
      });
      creditoId = approval.creditoId;
      integracion = approval.integration;
    } else if (app.estado !== 'APROBADA') {
      throw new CreditValidationError('La solicitud ya no puede aprobarse.');
    }
    if (!creditoId) throw new CreditValidationError('No se pudo identificar el crédito concedido.');
    const plan = await this.plans.create({
      creditoId,
      actorId: actor.id,
      frecuencia: input.plan.frecuencia,
      cuotas: installments,
      claveIdempotencia: input.claveIdempotencia + ':PLAN',
    });
    return { creditoId, plan, integracion };
  }
}

function toCents(value: string): number {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) {
    throw new CreditValidationError('Monto de aprobación inválido.');
  }
  const [whole, decimals = ''] = value.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}
function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}
