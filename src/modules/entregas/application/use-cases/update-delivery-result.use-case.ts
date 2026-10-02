import { DispatchDirectoryPort } from '../../../despachos';
import { TransportDirectoryPort } from '../../../transporte';
import { DeliveryRepositoryPort } from '../../domain/ports/delivery.repository.port';
import { Delivery } from '../../domain/entities/delivery.entity';
import { DeliveryValidationError } from '../../domain/errors/delivery.errors';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { UpdateDeliveryResultCommand } from '../models/delivery.models';
import { deliveryContext } from './delivery.helpers';

export class UpdateDeliveryResultUseCase {
  constructor(
    private readonly repository: DeliveryRepositoryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly transport: TransportDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
  ) {}

  async execute(command: UpdateDeliveryResultCommand) {
    const { delivery, stop } = await deliveryContext(
      command.id, command.actorId, this.repository, this.actors, this.transport, this.dispatches,
    );
    const entity = Delivery.restore({ estado: delivery.estado, version: delivery.version, detalles: [] });
    entity.assertEditable();
    if (!stop) throw new DeliveryValidationError('No se puede validar la carga de esta entrega.');

    const loaded = new Map(stop.carga.map((x) => [x.ordenDespachoDetalleId, x.cantidadCargada]));
    const byId = new Map(delivery.detalles.map((x) => [x.id, x]));

    for (const line of command.detalles) {
      const current = byId.get(line.detalleId);
      if (!current) throw new DeliveryValidationError('El detalle no pertenece a la entrega.', { detalleId: line.detalleId });
      const cantidadCargada = loaded.get(current.ordenDespachoDetalleId) ?? 0;
      entity.validateLineResult({
        cantidadCargada,
        cantidadEntregada: line.cantidadEntregada,
        cantidadRechazada: line.cantidadRechazada,
        motivoRechazo: line.motivoRechazo,
      });
    }

    await this.repository.updateResult({
      id: delivery.id,
      expectedVersion: delivery.version,
      receptorNombre: command.receptorNombre,
      receptorDocumento: command.receptorDocumento,
      latitud: command.latitud,
      longitud: command.longitud,
      observaciones: command.observaciones,
      detalles: command.detalles.map((x) => ({
        id: x.detalleId,
        cantidadEntregada: x.cantidadEntregada,
        cantidadRechazada: x.cantidadRechazada,
        motivoRechazo: x.motivoRechazo,
      })),
    });
    return this.repository.findById(delivery.id);
  }
}
