import { DispatchDirectoryPort } from '../../../despachos';
import {
  TransportNotFoundError,
  TransportQuantityExceededError,
  TransportValidationError,
} from '../../domain/errors/transport.errors';
import { TransportWorkflowPort } from '../../domain/ports/transport-workflow.port';
import { TransportActorDirectoryPort } from '../ports/transport-actor-directory.port';
import { TransportQueryPort } from '../ports/transport-query.port';
import {
  assertPlanner,
  requireTransportActor,
  transportReadScope,
} from './transport.helpers';
export class ConfirmShipmentLoadUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
  ) {}
  async execute(input: any) {
    const actor = await requireTransportActor(this.actors, input.actorId);
    assertPlanner(actor);
    const shipment = await this.query.getShipment(
      input.id,
      transportReadScope(actor),
    );
    if (!shipment) throw new TransportNotFoundError(input.id);
    if (shipment.estado !== 'ASIGNADO')
      throw new TransportValidationError(
        'El envío debe estar ASIGNADO antes de confirmar carga.',
      );
    const requested = new Map(
      input.lineas.map((x: any) => [x.cargaDetalleId, x]),
    );
    for (const stop of shipment.paradas) {
      const dispatch = await this.dispatches.findById(stop.ordenDespacho.id);
      if (!dispatch) continue;
      const dm = new Map(dispatch.detalles.map((x) => [x.id, x]));
      for (const load of stop.cargas) {
        const line: any = requested.get(load.id);
        if (!line) continue;
        const source = dm.get(load.ordenDespachoDetalleId);
        if (
          !source ||
          line.cantidadCargada <= 0 ||
          line.cantidadCargada > load.cantidadPlanificada ||
          line.cantidadCargada > source.cantidadDespachada
        )
          throw new TransportQuantityExceededError({
            cargaDetalleId: load.id,
            planificada: load.cantidadPlanificada,
            despachada: source?.cantidadDespachada ?? 0,
            solicitada: line.cantidadCargada,
          });
      }
    }
    await this.workflow.confirmLoad({
      shipmentId: input.id,
      expectedVersion: shipment.version,
      actorId: actor.id,
      claveIdempotencia: input.claveIdempotencia,
      lineas: input.lineas,
    });
  }
}
