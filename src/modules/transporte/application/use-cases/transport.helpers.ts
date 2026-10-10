import { TransportActorDirectoryPort } from '../ports/transport-actor-directory.port';
import {
  TransportActorNotFoundError,
  TransportCompanyRequiredError,
  TransportForbiddenError,
} from '../../domain/errors/transport.errors';
export async function requireTransportActor(
  users: TransportActorDirectoryPort,
  actorId: number,
) {
  const actor = await users.findById(actorId);
  if (!actor || !actor.activo) throw new TransportActorNotFoundError(actorId);
  if (!actor.empresaId) throw new TransportCompanyRequiredError(actorId);
  return actor as typeof actor & { empresaId: number };
}
export function assertPlanner(actor: { rol: string }) {
  if (!['ADMIN', 'BODEGA'].includes(actor.rol))
    throw new TransportForbiddenError(
      'Solo ADMIN o BODEGA pueden planificar y asignar transporte.',
    );
}
export function assertRouteOperator(
  actor: { id: number; rol: string },
  responsibleId: number | null,
) {
  if (['ADMIN', 'BODEGA'].includes(actor.rol)) return;
  if (actor.rol === 'REPARTIDOR' && responsibleId === actor.id) return;
  throw new TransportForbiddenError(
    'Solo el responsable asignado, ADMIN o BODEGA pueden ejecutar esta operación.',
  );
}
export function transportReadScope(actor: {
  id: number;
  rol: string;
  empresaId: number;
}) {
  return {
    empresaId: actor.empresaId,
    rol: actor.rol,
    ...(actor.rol === 'VENDEDOR' ? { vendedorId: actor.id } : {}),
    ...(actor.rol === 'REPARTIDOR' ? { responsableId: actor.id } : {}),
  };
}
