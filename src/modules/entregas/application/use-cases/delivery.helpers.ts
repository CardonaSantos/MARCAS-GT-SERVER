import { DeliveryActor } from '../../delivery.types';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
} from '../../domain/errors/delivery.errors';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { DeliveryRepositoryPort } from '../../domain/ports/delivery.repository.port';
import { DispatchDirectoryPort } from '../../../despachos';
import { TransportDirectoryPort } from '../../../transporte';

export async function requireDeliveryActor(
  directory: DeliveryActorDirectoryPort,
  actorId: number,
): Promise<DeliveryActor & { empresaId: number }> {
  const actor = await directory.findById(actorId);
  if (!actor || !actor.activo) {
    throw new DeliveryForbiddenError('Usuario inexistente o inactivo.');
  }
  if (!actor.empresaId) {
    throw new DeliveryForbiddenError('El usuario no tiene empresa asignada.');
  }
  return actor as DeliveryActor & { empresaId: number };
}

export function deliveryReadScope(actor: DeliveryActor & { empresaId: number }) {
  return {
    empresaId: actor.empresaId,
    rol: actor.rol,
    ...(actor.rol === 'VENDEDOR' ? { vendedorId: actor.id } : {}),
    ...(actor.rol === 'REPARTIDOR' ? { responsableId: actor.id } : {}),
  };
}

export function assertDeliveryOperator(
  actor: { id: number; rol: string },
  responsableId: number | null,
) {
  if (['ADMIN', 'BODEGA'].includes(actor.rol)) return;
  if (actor.rol === 'REPARTIDOR' && responsableId === actor.id) return;
  throw new DeliveryForbiddenError(
    'Solo ADMIN, BODEGA o el repartidor responsable pueden operar esta entrega.',
  );
}

export async function deliveryContext(
  id: number,
  actorId: number,
  repository: DeliveryRepositoryPort,
  actors: DeliveryActorDirectoryPort,
  transport: TransportDirectoryPort,
  dispatches: DispatchDirectoryPort,
) {
  const actor = await requireDeliveryActor(actors, actorId);
  const delivery = await repository.findById(id);
  if (!delivery) throw new DeliveryNotFoundError(id);

  const stop = delivery.envioDespachoId
    ? await transport.findStopById(delivery.envioDespachoId)
    : null;
  const dispatch = await dispatches.findById(delivery.ordenDespachoId);

  const empresaId = stop?.empresaId ?? dispatch?.empresaId;
  if (!empresaId || empresaId !== actor.empresaId) {
    throw new DeliveryForbiddenError('La entrega pertenece a otra empresa.');
  }

  assertDeliveryOperator(actor, stop?.responsableId ?? null);
  return { actor, delivery, stop, dispatch };
}
