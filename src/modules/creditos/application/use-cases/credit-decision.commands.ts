import { OrderCreditGatePort, OrderDirectoryPort } from '../../../pedidos';
import {
  CreditApplicationNotFoundError,
  CreditDecisionNotReadyError,
  CreditIntegrationNotFoundError,
  CreditOrderInvalidError,
  CreditValidationError,
} from '../../domain/errors/credit.errors';
import { CreditActorDirectoryPort } from '../../domain/ports/credit-actor-directory.port';
import {
  CreditApplicationRepositoryPort,
  CreditDecisionRepositoryPort,
  CreditEvidenceRepositoryPort,
  CreditIntegrationRepositoryPort,
  CreditPolicyRepositoryPort,
} from '../../domain/ports/credit.repositories';
import { CreditMoney } from '../../domain/value-objects/credit-money.vo';
import {
  assertApplicationAccess,
  assertOrderForCredit,
  assertReviewer,
  requireCreditActor,
  validateAdvanceForOrder,
  validateAgainstOrder,
  validatePolicy,
} from './credit.helpers';
export class CreditOrderIntegrationService {
  constructor(
    private readonly integrations: CreditIntegrationRepositoryPort,
    private readonly gate: OrderCreditGatePort,
  ) {}
  async apply(applicationId: number, actorId: number) {
    const op = await this.integrations.findByApplicationId(applicationId);
    if (!op) throw new CreditIntegrationNotFoundError(applicationId);
    if (op.estado === 'APLICADA')
      return { applied: true, repeated: true, state: 'APLICADA' as const };
    try {
      const result =
        op.tipo === 'APROBACION'
          ? await this.gate.confirmApprovedCredit({
              pedidoId: op.pedidoId,
              solicitudCreditoId: op.solicitudId,
              actorId,
              empresaId: op.empresaId,
            })
          : await this.gate.registerCreditRejection({
              pedidoId: op.pedidoId,
              solicitudCreditoId: op.solicitudId,
              actorId,
              empresaId: op.empresaId,
              motivo: op.reason ?? 'Crédito rechazado o cancelado.',
            });
      await this.integrations.markApplied({ operationId: op.id, actorId });
      return {
        applied: true,
        repeated: result.repeated,
        state: 'APLICADA' as const,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.integrations.markFailed({
        operationId: op.id,
        actorId,
        error: message.slice(0, 1000),
      });
      return {
        applied: false,
        repeated: false,
        state: 'FALLIDA' as const,
        error: message,
      };
    }
  }
}
export class CreditDecisionCommands {
  constructor(
    private readonly apps: CreditApplicationRepositoryPort,
    private readonly evidence: CreditEvidenceRepositoryPort,
    private readonly decisions: CreditDecisionRepositoryPort,
    private readonly policies: CreditPolicyRepositoryPort,
    private readonly users: CreditActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
    private readonly integration: CreditOrderIntegrationService,
  ) {}
  async approve(c: {
    id: number;
    montoAutorizado: string;
    plazoAutorizadoDias: number;
    anticipoRequerido: string;
    observaciones?: string | null;
    claveIdempotencia: string;
    actorId: number;
  }) {
    const actor = await requireCreditActor(this.users, c.actorId);
    assertReviewer(actor);
    const app = await this.apps.findById(c.id);
    if (!app) throw new CreditApplicationNotFoundError(c.id);
    const order = await this.orders.findById(app.pedidoId);
    if (!order)
      throw new CreditOrderInvalidError('El pedido relacionado ya no existe.', {
        pedidoId: app.pedidoId,
      });
    assertApplicationAccess(actor, app, order);
    assertOrderForCredit(order, actor);
    app.assertReviewable();
    const readiness = await this.evidence.getReadiness(c.id);
    if (
      readiness.requisitosPendientes > 0 ||
      readiness.requisitosNoCumplidos > 0 ||
      readiness.referenciasPendientes > 0 ||
      readiness.documentosPendientes > 0
    )
      throw new CreditDecisionNotReadyError(readiness);
    const authorized = CreditMoney.from(c.montoAutorizado),
      requested = CreditMoney.from(app.montoSolicitado),
      orderTotal = CreditMoney.from(order.total),
      advance = CreditMoney.from(c.anticipoRequerido);
    if (
      authorized.isZero() ||
      !authorized.equals(requested) ||
      !authorized.equals(orderTotal)
    )
      throw new CreditValidationError(
        'Para confirmar el pedido, el monto autorizado debe coincidir con el monto solicitado y con el total vigente del pedido.',
        {
          montoAutorizado: authorized.toString(),
          montoSolicitado: requested.toString(),
          pedidoTotal: orderTotal.toString(),
        },
      );
    validateAgainstOrder(order, authorized.toString());
    validateAdvanceForOrder(order, advance.toString());
    if (advance.isGreaterThan(authorized))
      throw new CreditValidationError(
        'El anticipo requerido no puede superar el monto autorizado.',
      );
    if (!Number.isInteger(c.plazoAutorizadoDias) || c.plazoAutorizadoDias <= 0)
      throw new CreditValidationError('El plazo autorizado es inválido.');
    const policy = app.politicaId
      ? await this.policies.findPolicyById(app.politicaId)
      : null;
    validatePolicy(policy, {
      monto: c.montoAutorizado,
      plazoDias: c.plazoAutorizadoDias,
      anticipo: c.anticipoRequerido,
    });
    const adjusted =
      !authorized.equals(requested) ||
      c.plazoAutorizadoDias !== app.plazoDias ||
      !advance.equals(CreditMoney.from(app.anticipoPropuesto));
    const committed = await this.decisions.approve({
      application: app,
      expectedVersion: app.version,
      actorId: actor.id,
      tipo: adjusted ? 'AJUSTADA' : 'APROBADA',
      montoAutorizado: authorized.toString(),
      anticipoRequerido: advance.toString(),
      plazoAutorizadoDias: c.plazoAutorizadoDias,
      observaciones: c.observaciones,
      claveIdempotencia: c.claveIdempotencia,
    });
    const integration = await this.integration.apply(c.id, actor.id);
    return { ...committed, integration };
  }
  async reject(c: {
    id: number;
    motivo: string;
    claveIdempotencia: string;
    actorId: number;
  }) {
    const actor = await requireCreditActor(this.users, c.actorId);
    assertReviewer(actor);
    const app = await this.apps.findById(c.id);
    if (!app) throw new CreditApplicationNotFoundError(c.id);
    const order = await this.orders.findById(app.pedidoId);
    if (!order)
      throw new CreditOrderInvalidError('El pedido relacionado ya no existe.', {
        pedidoId: app.pedidoId,
      });
    assertApplicationAccess(actor, app, order);
    app.assertReviewable();
    if (c.motivo.trim().length < 3)
      throw new CreditValidationError(
        'El motivo de rechazo debe contener al menos 3 caracteres.',
      );
    const committed = await this.decisions.reject({
      application: app,
      expectedVersion: app.version,
      actorId: actor.id,
      observaciones: c.motivo.trim(),
      claveIdempotencia: c.claveIdempotencia,
    });
    const integration = await this.integration.apply(c.id, actor.id);
    return { ...committed, integration };
  }
  async retry(id: number, actorId: number) {
    const actor = await requireCreditActor(this.users, actorId);
    assertReviewer(actor);
    return this.integration.apply(id, actor.id);
  }
}
