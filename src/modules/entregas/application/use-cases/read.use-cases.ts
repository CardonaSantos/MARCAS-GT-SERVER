import { TrackingDirectoryPort } from '../../../tracking';
import { DeliveryNotFoundError } from '../../domain/errors/delivery.errors';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { DeliveryQueryPort } from '../ports/delivery-query.port';
import { deliveryReadScope, requireDeliveryActor } from './delivery.helpers';

export class ListDeliveriesUseCase {
  constructor(private readonly query: DeliveryQueryPort, private readonly actors: DeliveryActorDirectoryPort) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireDeliveryActor(this.actors, actorId);
    return this.query.list({ ...filters, scope: deliveryReadScope(actor) });
  }
}
export class ListDeliveryCandidatesUseCase {
  constructor(private readonly query: DeliveryQueryPort, private readonly actors: DeliveryActorDirectoryPort) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireDeliveryActor(this.actors, actorId);
    return this.query.listCandidates({ ...filters, scope: deliveryReadScope(actor) });
  }
}
export class GetDeliveryUseCase {
  constructor(
    private readonly query: DeliveryQueryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly tracking: TrackingDirectoryPort,
  ) {}
  async execute(id: number, actorId: number) {
    const actor = await requireDeliveryActor(this.actors, actorId);
    const view = await this.query.get(id, deliveryReadScope(actor));
    if (!view) throw new DeliveryNotFoundError(id);
    const current = view.transporte?.responsable?.id
      ? await this.tracking.getCurrent(view.transporte.responsable.id)
      : null;
    return {
      ...view,
      trackingActual: current
        ? { ...current, stale: Date.now() - current.capturadoEn.getTime() > 300000 }
        : null,
    };
  }
}
export class ListDeliveryEventsUseCase {
  constructor(private readonly query: DeliveryQueryPort, private readonly actors: DeliveryActorDirectoryPort) {}
  async execute(id: number, filters: any, actorId: number) {
    const actor = await requireDeliveryActor(this.actors, actorId);
    return this.query.listEvents(id, deliveryReadScope(actor), filters);
  }
}
export class ListDeliveryEvidenceUseCase {
  constructor(private readonly query: DeliveryQueryPort, private readonly actors: DeliveryActorDirectoryPort) {}
  async execute(id: number, actorId: number) {
    const actor = await requireDeliveryActor(this.actors, actorId);
    return this.query.listEvidence(id, deliveryReadScope(actor));
  }
}
export class GetDeliverySummaryUseCase {
  constructor(private readonly query: DeliveryQueryPort, private readonly actors: DeliveryActorDirectoryPort) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireDeliveryActor(this.actors, actorId);
    return this.query.getSummary(deliveryReadScope(actor), filters);
  }
}
export class GetDeliveryOperationalReportUseCase {
  constructor(private readonly query: DeliveryQueryPort, private readonly actors: DeliveryActorDirectoryPort) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireDeliveryActor(this.actors, actorId);
    return this.query.getOperationalReport(deliveryReadScope(actor), filters);
  }
}
