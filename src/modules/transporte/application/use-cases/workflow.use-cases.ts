import { TransportNotFoundError } from '../../domain/errors/transport.errors';
import { TransportWorkflowPort } from '../../domain/ports/transport-workflow.port';
import { TransportActorDirectoryPort } from '../ports/transport-actor-directory.port';
import { TransportQueryPort } from '../ports/transport-query.port';
import {
  assertPlanner,
  assertRouteOperator,
  requireTransportActor,
  transportReadScope,
} from './transport.helpers';
export class StartShipmentRouteUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any) {
    const actor = await requireTransportActor(this.actors, input.actorId);
    const current = await this.query.getShipmentState(
      input.id,
      transportReadScope(actor),
    );
    if (!current) throw new TransportNotFoundError(input.id);
    assertRouteOperator(actor, current.responsableId);
    return this.workflow.startRoute({
      shipmentId: input.id,
      expectedVersion: current.version,
      actorId: actor.id,
      claveIdempotencia: input.claveIdempotencia,
      latitud: input.latitud,
      longitud: input.longitud,
    });
  }
}
export class CancelShipmentUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any) {
    const actor = await requireTransportActor(this.actors, input.actorId);
    assertPlanner(actor);
    const current = await this.query.getShipmentState(
      input.id,
      transportReadScope(actor),
    );
    if (!current) throw new TransportNotFoundError(input.id);
    return this.workflow.cancelShipment({
      shipmentId: input.id,
      expectedVersion: current.version,
      actorId: actor.id,
      motivo: input.motivo,
      claveIdempotencia: input.claveIdempotencia,
    });
  }
}
export class ReportShipmentIncidentUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any) {
    const actor = await requireTransportActor(this.actors, input.actorId);
    const current = await this.query.getShipmentState(
      input.id,
      transportReadScope(actor),
    );
    if (!current) throw new TransportNotFoundError(input.id);
    assertRouteOperator(actor, current.responsableId);
    return this.workflow.reportIncident({
      shipmentId: input.id,
      actorId: actor.id,
      tipo: input.tipo,
      severidad: input.severidad,
      descripcion: input.descripcion,
      latitud: input.latitud,
      longitud: input.longitud,
      claveIdempotencia: input.claveIdempotencia,
    });
  }
}
export class ResolveShipmentIncidentUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any) {
    const actor = await requireTransportActor(this.actors, input.actorId);
    const current = await this.query.getShipmentState(
      input.id,
      transportReadScope(actor),
    );
    if (!current) throw new TransportNotFoundError(input.id);
    assertRouteOperator(actor, current.responsableId);
    return this.workflow.resolveIncident({
      shipmentId: input.id,
      incidentId: input.incidentId,
      actorId: actor.id,
      resolucion: input.resolucion,
      claveIdempotencia: input.claveIdempotencia,
    });
  }
}


export class AddShipmentObservationUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}

  async execute(input: any) {
    const actor = await requireTransportActor(this.actors, input.actorId);
    const current = await this.query.getShipmentState(
      input.id,
      transportReadScope(actor),
    );

    if (!current) {
      throw new TransportNotFoundError(input.id);
    }

    return this.workflow.addObservation({
      shipmentId: input.id,
      actorId: actor.id,
      detalle: input.detalle,
      claveIdempotencia: input.claveIdempotencia,
    });
  }
}
