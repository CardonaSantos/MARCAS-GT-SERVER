import { DispatchDirectoryPort } from '../../../despachos';
import { TransportDirectoryPort } from '../../../transporte';
import { DeliveryRepositoryPort } from '../../domain/ports/delivery.repository.port';
import { Delivery } from '../../domain/entities/delivery.entity';
import { DeliveryValidationError } from '../../domain/errors/delivery.errors';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { DeliveryEvidenceStoragePort } from '../ports/delivery-evidence-storage.port';
import { deliveryContext } from './delivery.helpers';

export class AddDeliveryEvidenceUseCase {
  constructor(
    private readonly repository: DeliveryRepositoryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly transport: TransportDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
    private readonly storage: DeliveryEvidenceStoragePort,
  ) {}

  async execute(id: number, input: any, actorId: number) {
    const { delivery, actor } = await deliveryContext(
      id, actorId, this.repository, this.actors, this.transport, this.dispatches,
    );
    Delivery.restore({ estado: delivery.estado, version: delivery.version, detalles: [] }).assertEvidenceEditable();

    if (!input.url && !input.contenido) {
      throw new DeliveryValidationError('Debe proporcionar url o contenido para la evidencia.');
    }

    const uploaded = input.contenido
      ? await this.storage.upload({
          entregaId: delivery.id,
          tipo: input.tipo,
          content: input.contenido,
          mimeType: input.mimeType,
        })
      : {
          url: input.url,
          key: input.key ?? null,
          mimeType: input.mimeType ?? null,
          size: input.size ?? null,
        };

    return this.repository.addEvidence({
      entregaId: delivery.id,
      tipo: input.tipo,
      ...uploaded,
      descripcion: input.descripcion,
      claveIdempotencia: input.claveIdempotencia,
      actorId: actor.id,
    });
  }
}

export class RemoveDeliveryEvidenceUseCase {
  constructor(
    private readonly repository: DeliveryRepositoryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly transport: TransportDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
    private readonly storage: DeliveryEvidenceStoragePort,
  ) {}

  async execute(id: number, evidenciaId: number, actorId: number) {
    const { delivery, actor } = await deliveryContext(
      id, actorId, this.repository, this.actors, this.transport, this.dispatches,
    );
    Delivery.restore({ estado: delivery.estado, version: delivery.version, detalles: [] }).assertEvidenceEditable();
    const removed = await this.repository.removeEvidence({ entregaId: id, evidenciaId });
    if (!removed) throw new DeliveryValidationError('Evidencia no encontrada.');
    if (removed.key) await this.storage.remove(removed.key);
    await this.repository.addObservation({
      id,
      actorId: actor.id,
      detalle: `Evidencia #${evidenciaId} eliminada.`,
      claveIdempotencia: `DELIVERY:EVIDENCE_REMOVED:${id}:${evidenciaId}`,
    });
    return { removed: true };
  }
}
