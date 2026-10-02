import { DispatchDirectoryPort } from '../../../despachos';
import { TransportDirectoryPort } from '../../../transporte';
import { DeliveryRepositoryPort } from '../../domain/ports/delivery.repository.port';
import { Delivery } from '../../domain/entities/delivery.entity';
import { DeliveryValidationError } from '../../domain/errors/delivery.errors';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { StartDeliveryCommand } from '../models/delivery.models';
import { deliveryContext } from './delivery.helpers';

export class StartDeliveryUseCase {
  constructor(
    private readonly repository: DeliveryRepositoryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly transport: TransportDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
  ) {}

  async execute(command: StartDeliveryCommand) {
    const { actor, delivery, stop } = await deliveryContext(
      command.id,
      command.actorId,
      this.repository,
      this.actors,
      this.transport,
      this.dispatches,
    );
    Delivery.restore({ estado: delivery.estado, version: delivery.version, detalles: [] }).assertStartable();
    if (!stop || stop.paradaEstado !== 'EN_RUTA') {
      throw new DeliveryValidationError('La parada de transporte ya no está disponible para atención.');
    }
    await this.repository.start({
      id: delivery.id,
      actorId: actor.id,
      expectedVersion: delivery.version,
      latitud: command.latitud,
      longitud: command.longitud,
      claveIdempotencia: command.claveIdempotencia,
    });
    return this.repository.findById(delivery.id);
  }
}
