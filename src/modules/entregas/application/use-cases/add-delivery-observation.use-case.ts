import { DispatchDirectoryPort } from '../../../despachos';
import { TransportDirectoryPort } from '../../../transporte';
import { DeliveryRepositoryPort } from '../../domain/ports/delivery.repository.port';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { deliveryContext } from './delivery.helpers';

export class AddDeliveryObservationUseCase {
  constructor(
    private readonly repository: DeliveryRepositoryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly transport: TransportDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
  ) {}
  async execute(id: number, detalle: string, claveIdempotencia: string, actorId: number) {
    const { actor } = await deliveryContext(
      id, actorId, this.repository, this.actors, this.transport, this.dispatches,
    );
    await this.repository.addObservation({
      id,
      actorId: actor.id,
      detalle,
      claveIdempotencia,
    });
    return { ok: true };
  }
}
