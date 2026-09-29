import { OrderDirectoryPort } from '../../../pedidos';
import { CreditApplication } from '../../domain/entities/credit-application.entity';
import {
  CreditActiveApplicationExistsError,
  CreditApplicationNotFoundError,
  CreditOrderInvalidError,
  CreditPolicyNotFoundError,
} from '../../domain/errors/credit.errors';
import { CreditActorDirectoryPort } from '../../domain/ports/credit-actor-directory.port';
import {
  CreditApplicationRepositoryPort,
  CreditDecisionRepositoryPort,
  CreditIntegrationRepositoryPort,
  CreditPolicyRepositoryPort,
} from '../../domain/ports/credit.repositories';
import { CreditOrderIntegrationService } from './credit-decision.commands';
import {
  assertApplicationAccess,
  assertDraftWriter,
  assertOrderForCredit,
  requireCreditActor,
  snapshots,
  validateAgainstOrder,
  validateAdvanceForOrder,
  validatePolicy,
} from './credit.helpers';

export class CreditApplicationCommands {
  constructor(
    private readonly repo: CreditApplicationRepositoryPort,
    private readonly decisions: CreditDecisionRepositoryPort,
    private readonly integrations: CreditIntegrationRepositoryPort,
    private readonly policies: CreditPolicyRepositoryPort,
    private readonly users: CreditActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
    private readonly integration: CreditOrderIntegrationService,
  ) {}

  async create(command: {
    pedidoId: number;
    politicaId?: number | null;
    montoSolicitado: string;
    plazoDias: number;
    anticipoPropuesto?: string;
    motivo?: string | null;
    actorId: number;
  }) {
    const actor = await requireCreditActor(this.users, command.actorId);
    assertDraftWriter(actor);

    const order = await this.orders.findById(command.pedidoId);
    if (!order) {
      throw new CreditOrderInvalidError('El pedido relacionado no existe.', {
        pedidoId: command.pedidoId,
      });
    }
    assertOrderForCredit(order, actor);

    const blocking = await this.integrations.findBlockingByOrderId(order.id);
    if (blocking) {
      throw new CreditOrderInvalidError(
        'El pedido tiene una integración de crédito pendiente o fallida que debe resolverse antes de crear otra solicitud.',
        { operacionId: blocking.id, estado: blocking.estado },
      );
    }

    const existing = await this.repo.findActiveByOrderId(order.id);
    if (existing) {
      throw new CreditActiveApplicationExistsError(
        order.id,
        existing.id ?? undefined,
      );
    }

    const policy = command.politicaId
      ? await this.policies.findPolicyById(command.politicaId)
      : null;
    if (command.politicaId && !policy) {
      throw new CreditPolicyNotFoundError(command.politicaId);
    }
    if (policy && policy.empresaId !== actor.empresaId) {
      throw new CreditPolicyNotFoundError(command.politicaId!);
    }

    const advance = command.anticipoPropuesto ?? '0.00';
    validateAgainstOrder(order, command.montoSolicitado);
    validateAdvanceForOrder(order, advance);
    validatePolicy(policy, {
      monto: command.montoSolicitado,
      plazoDias: command.plazoDias,
      anticipo: advance,
    });

    const entity = CreditApplication.create({
      empresaId: actor.empresaId,
      pedidoId: order.id,
      clienteId: order.clienteId,
      solicitanteId: actor.id,
      politicaId: command.politicaId ?? null,
      montoSolicitado: command.montoSolicitado,
      plazoDias: command.plazoDias,
      anticipoPropuesto: advance,
      motivo: command.motivo ?? null,
    });

    return this.repo.create(entity, snapshots(policy), {
      actorId: actor.id,
      tipo: 'CREADA',
      detalle: 'Solicitud de crédito creada desde pedido.',
    });
  }

  async update(command: {
    id: number;
    politicaId?: number | null;
    montoSolicitado?: string;
    plazoDias?: number;
    anticipoPropuesto?: string;
    motivo?: string | null;
    actorId: number;
  }) {
    const actor = await requireCreditActor(this.users, command.actorId);
    assertDraftWriter(actor);

    const entity = await this.repo.findById(command.id);
    if (!entity) throw new CreditApplicationNotFoundError(command.id);

    const order = await this.orders.findById(entity.pedidoId);
    if (!order) {
      throw new CreditOrderInvalidError('El pedido relacionado ya no existe.', {
        pedidoId: entity.pedidoId,
      });
    }
    assertApplicationAccess(actor, entity, order);

    const newPolicyId =
      command.politicaId === undefined ? entity.politicaId : command.politicaId;
    const policy = newPolicyId
      ? await this.policies.findPolicyById(newPolicyId)
      : null;
    if (newPolicyId && !policy) throw new CreditPolicyNotFoundError(newPolicyId);
    if (policy && policy.empresaId !== actor.empresaId) {
      throw new CreditPolicyNotFoundError(newPolicyId!);
    }

    const amount = command.montoSolicitado ?? entity.montoSolicitado;
    const term = command.plazoDias ?? entity.plazoDias;
    const advance = command.anticipoPropuesto ?? entity.anticipoPropuesto;

    validateAgainstOrder(order, amount);
    validateAdvanceForOrder(order, advance);
    validatePolicy(policy, { monto: amount, plazoDias: term, anticipo: advance });

    const expectedVersion = entity.version;
    entity.updateDraft({
      politicaId: command.politicaId,
      montoSolicitado: command.montoSolicitado,
      plazoDias: command.plazoDias,
      anticipoPropuesto: command.anticipoPropuesto,
      motivo: command.motivo,
    });

    return this.repo.save(
      entity,
      expectedVersion,
      {
        actorId: actor.id,
        tipo: 'ACTUALIZADA',
        detalle: 'Solicitud de crédito actualizada.',
      },
      command.politicaId !== undefined
        ? { replaceRequirements: snapshots(policy) }
        : undefined,
    );
  }

  async submit(id: number, actorId: number) {
    const actor = await requireCreditActor(this.users, actorId);
    assertDraftWriter(actor);

    const entity = await this.repo.findById(id);
    if (!entity) throw new CreditApplicationNotFoundError(id);

    const order = await this.orders.findById(entity.pedidoId);
    if (!order) {
      throw new CreditOrderInvalidError('El pedido relacionado ya no existe.', {
        pedidoId: entity.pedidoId,
      });
    }
    assertApplicationAccess(actor, entity, order);
    assertOrderForCredit(order, actor);

    const expectedVersion = entity.version;
    entity.submitForReview();

    return this.repo.save(entity, expectedVersion, {
      actorId: actor.id,
      tipo: 'ENVIADA_REVISION',
      detalle: 'Expediente enviado a revisión.',
    });
  }

  async cancel(
    id: number,
    reason: string,
    key: string,
    actorId: number,
  ) {
    const actor = await requireCreditActor(this.users, actorId);
    assertDraftWriter(actor);

    const entity = await this.repo.findById(id);
    if (!entity) throw new CreditApplicationNotFoundError(id);

    const order = await this.orders.findById(entity.pedidoId);
    if (!order) {
      throw new CreditOrderInvalidError('El pedido relacionado ya no existe.', {
        pedidoId: entity.pedidoId,
      });
    }
    assertApplicationAccess(actor, entity, order);

    const expectedVersion = entity.version;
    entity.cancel(reason);

    const committed = await this.decisions.cancel({
      application: entity,
      expectedVersion,
      actorId: actor.id,
      claveIdempotencia: key,
    });
    const integration = await this.integration.apply(entity.id!, actor.id);

    return { ...committed, integration };
  }
}
