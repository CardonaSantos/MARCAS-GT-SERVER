import { TrackingDirectoryPort } from '../../../tracking';
import { TransportActorDirectoryPort } from '../ports/transport-actor-directory.port';
import { TransportQueryPort } from '../ports/transport-query.port';
import { requireTransportActor, transportReadScope } from './transport.helpers';
import { TransportNotFoundError } from '../../domain/errors/transport.errors';
import { ShipmentIncidentState } from '../../transport.types';
export class ListShipmentsUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireTransportActor(this.actors, actorId);
    return this.query.listShipments({
      ...filters,
      scope: transportReadScope(actor),
    });
  }
}
export class GetShipmentUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
    private readonly tracking: TrackingDirectoryPort,
  ) {}
  async execute(id: number, actorId: number) {
    const actor = await requireTransportActor(this.actors, actorId);
    const view = await this.query.getShipment(id, transportReadScope(actor));
    if (!view) throw new TransportNotFoundError(id);
    const current = view.responsable?.id
      ? await this.tracking.getCurrent(view.responsable.id)
      : null;
    return {
      ...view,
      trackingActual: current
        ? {
            ...current,
            stale:
              !current.capturadoEn ||
              Date.now() - current.capturadoEn.getTime() > 300000,
          }
        : null,
    };
  }
}
export class ListShipmentCandidatesUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireTransportActor(this.actors, actorId);
    return this.query.listCandidates({
      ...filters,
      scope: transportReadScope(actor),
    });
  }
}
export class ListShipmentEventsUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(
    id: number,
    filters: { page: number; limit: number },
    actorId: number,
  ) {
    const actor = await requireTransportActor(this.actors, actorId);
    return this.query.listEvents(
      id,
      transportReadScope(actor),
      filters.page,
      filters.limit,
    );
  }
}
export class ListShipmentIncidentsUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(
    id: number,
    filters: {
      page: number;
      limit: number;
      estado?: ShipmentIncidentState;
    },
    actorId: number,
  ) {
    const actor = await requireTransportActor(this.actors, actorId);
    return this.query.listIncidents(
      id,
      transportReadScope(actor),
      filters.page,
      filters.limit,
      filters.estado,
    );
  }
}
export class GetTransportSummaryUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireTransportActor(this.actors, actorId);
    return this.query.getSummary(transportReadScope(actor), filters);
  }
}
export class GetTransportOperationalReportUseCase {
  constructor(
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(filters: any, actorId: number) {
    const actor = await requireTransportActor(this.actors, actorId);
    return this.query.getOperationalReport(transportReadScope(actor), filters);
  }
}
