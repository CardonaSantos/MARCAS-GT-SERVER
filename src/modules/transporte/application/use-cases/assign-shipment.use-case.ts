import { TransportCatalogRepositoryPort } from '../../domain/ports/transport-catalog.repository.port';
import { TransportWorkflowPort } from '../../domain/ports/transport-workflow.port';
import {
  TransportIdempotencyConflictError,
  TransportNotFoundError,
  TransportResourceNotFoundError,
  TransportResourceUnavailableError,
  TransportValidationError,
} from '../../domain/errors/transport.errors';
import { TransportQueryPort } from '../ports/transport-query.port';
import { TransportActorDirectoryPort } from '../ports/transport-actor-directory.port';
import {
  assertPlanner,
  requireTransportActor,
  transportReadScope,
} from './transport.helpers';
export class AssignShipmentUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly catalog: TransportCatalogRepositoryPort,
    private readonly query: TransportQueryPort,
    private readonly actors: TransportActorDirectoryPort,
  ) {}
  async execute(input: any) {
    const actor = await requireTransportActor(this.actors, input.actorId);
    assertPlanner(actor);

    const existing = await this.query.findIdempotentOperation(
      input.claveIdempotencia,
    );

    if (existing) {
      if (existing.envioId === input.id && existing.tipo === 'ASIGNADO') {
        return;
      }

      throw new TransportIdempotencyConflictError({
        claveIdempotencia: input.claveIdempotencia,
        envioId: input.id,
        envioExistente: existing.envioId,
        eventoExistente: existing.tipo,
      });
    }

    const current = await this.query.getShipmentState(
      input.id,
      transportReadScope(actor),
    );
    if (!current) throw new TransportNotFoundError(input.id);
    if (current.estado !== 'PROGRAMADO')
      throw new TransportValidationError(
        'El envío ya no está disponible para asignación.',
      );
    if (current.modalidad === 'INTERNO') {
      if (!input.vehiculoId || !input.conductorId || !input.responsableId)
        throw new TransportValidationError(
          'Un envío interno requiere vehículo, conductor y responsable.',
        );
      const [v, d, r] = await Promise.all([
        this.catalog.findVehicle(input.vehiculoId),
        this.catalog.findDriver(input.conductorId),
        this.actors.findById(input.responsableId),
      ]);
      if (!v)
        throw new TransportResourceNotFoundError('VEHICULO', input.vehiculoId);
      if (!d)
        throw new TransportResourceNotFoundError(
          'CONDUCTOR',
          input.conductorId,
        );
      if (!r)
        throw new TransportResourceNotFoundError(
          'RESPONSABLE',
          input.responsableId,
        );
      if (
        v.empresaId !== actor.empresaId ||
        !v.activo ||
        v.estado !== 'DISPONIBLE'
      )
        throw new TransportResourceUnavailableError('VEHICULO', v.id, v.estado);
      if (
        d.empresaId !== actor.empresaId ||
        !d.activo ||
        d.estado !== 'DISPONIBLE'
      )
        throw new TransportResourceUnavailableError(
          'CONDUCTOR',
          d.id,
          d.estado,
        );
      if (
        !r.activo ||
        r.empresaId !== actor.empresaId ||
        !['REPARTIDOR', 'ADMIN'].includes(r.rol)
      )
        throw new TransportResourceUnavailableError('RESPONSABLE', r.id, r.rol);
    } else {
      if (!input.transportistaId)
        throw new TransportValidationError(
          'Un envío externo requiere transportista.',
        );
      const c = await this.catalog.findCarrier(input.transportistaId);
      if (!c)
        throw new TransportResourceNotFoundError(
          'TRANSPORTISTA',
          input.transportistaId,
        );
      if (c.empresaId !== actor.empresaId || !c.activo || c.tipo !== 'EXTERNO')
        throw new TransportResourceUnavailableError(
          'TRANSPORTISTA',
          c.id,
          c.tipo,
        );
    }
    await this.workflow.assignResources({
      shipmentId: input.id,
      expectedVersion: current.version,
      actorId: actor.id,
      modalidad: current.modalidad,
      transportistaId: input.transportistaId,
      vehiculoId: input.vehiculoId,
      conductorId: input.conductorId,
      responsableId: input.responsableId,
      claveIdempotencia: input.claveIdempotencia,
    });
  }
}
