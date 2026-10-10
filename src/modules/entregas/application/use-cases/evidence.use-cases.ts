import { DispatchDirectoryPort } from '../../../despachos';
import { InvalidUploadError } from '../../../archivos';
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

    if (!input.claveIdempotencia || !/^.{8,200}$/.test(input.claveIdempotencia)) {
      throw new DeliveryValidationError('Clave de idempotencia inválida.');
    }
    // Evita volver a subir el mismo objeto si el cliente reintenta.
    const previous = await this.repository.findEvidenceByIdempotencyKey(input.claveIdempotencia);
    if (previous) {
      if (previous.entregaId !== delivery.id) {
        throw new DeliveryValidationError('La clave de evidencia pertenece a otra entrega.');
      }
      return { id: previous.id };
    }
    if (!input.buffer && !input.contenido && !input.url) {
      throw new DeliveryValidationError('Selecciona un archivo para la evidencia.');
    }

    if (!['FIRMA', 'FOTO', 'DOCUMENTO', 'OTRO'].includes(input.tipo)) {
      throw new DeliveryValidationError('Tipo de evidencia inválido.');
    }
    // Compatibilidad de clientes antiguos con URL: sin admitir claves de
    // almacenamiento arbitrarias que pudieran apuntar a otra empresa.
    if (!input.buffer && !input.contenido && !/^https:\/\//i.test(input.url ?? '')) {
      throw new DeliveryValidationError('La evidencia externa requiere URL HTTPS.');
    }
    let uploaded: { url: string; key: string | null; mimeType: string | null; size: number | null };
    try {
      uploaded = input.buffer || input.contenido
        ? await this.storage.upload({
            empresaId: actor.empresaId,
            entregaId: delivery.id,
            tipo: input.tipo,
            content: input.contenido,
            buffer: input.buffer,
            filename: input.filename,
            mimeType: input.mimeType,
          })
        : {
            url: input.url,
            key: null,
            mimeType: input.mimeType ?? null,
            size: input.size ?? null,
          };
    } catch (error) {
      if (error instanceof InvalidUploadError) {
        throw new DeliveryValidationError(error.message);
      }
      throw error;
    }

    try {
      const evidence = await this.repository.addEvidence({
        entregaId: delivery.id,
        tipo: input.tipo,
        ...uploaded,
        descripcion: input.descripcion,
        claveIdempotencia: input.claveIdempotencia,
        actorId: actor.id,
      });
      if (uploaded.key) {
        const stored = await this.repository.findEvidenceByIdempotencyKey(input.claveIdempotencia);
        if (stored?.key !== uploaded.key) {
          await this.storage.remove(uploaded.key).catch(() => undefined);
        }
      }
      return evidence;
    } catch (error) {
      if (uploaded.key) {
        await this.storage.remove(uploaded.key).catch(() => undefined);
      }
      throw error;
    }
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
