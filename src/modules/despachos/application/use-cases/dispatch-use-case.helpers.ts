import { BodegaDirectoryPort } from '../../../bodegas';
import {
  DispatchActorNotFoundError,
  DispatchCompanyRequiredError,
  DispatchForbiddenError,
  DispatchWarehouseCompanyMismatchError,
  DispatchWarehouseInactiveError,
  DispatchWarehouseNotFoundError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchActorEntry } from '../../dispatch.types';

export async function requireDispatchActor(
  users: DispatchActorDirectoryPort,
  actorId: number,
): Promise<DispatchActorEntry & { empresaId: number }> {
  const actor = await users.findById(actorId);
  if (!actor || !actor.activo) throw new DispatchActorNotFoundError(actorId);
  if (!actor.empresaId) throw new DispatchCompanyRequiredError(actorId);
  return actor as DispatchActorEntry & { empresaId: number };
}

export function assertDispatchOperator(
  actor: DispatchActorEntry & { empresaId: number },
): void {
  if (!['ADMIN', 'BODEGA'].includes(actor.rol)) {
    throw new DispatchForbiddenError(
      'Solo ADMIN o BODEGA pueden ejecutar operaciones de despacho.',
    );
  }
}

export function dispatchReadScope(
  actor: DispatchActorEntry & { empresaId: number },
): { empresaId: number; vendedorId?: number; rol: string } {
  return {
    empresaId: actor.empresaId,
    rol: actor.rol,
    ...(actor.rol === 'VENDEDOR' ? { vendedorId: actor.id } : {}),
  };
}

export async function requireOperationalWarehouse(
  bodegas: BodegaDirectoryPort,
  bodegaId: number,
  empresaId: number,
) {
  const bodega = await bodegas.findById(bodegaId);
  if (!bodega) throw new DispatchWarehouseNotFoundError(bodegaId);
  if (!bodega.activo) throw new DispatchWarehouseInactiveError(bodegaId);
  if (bodega.empresaId != null && bodega.empresaId !== empresaId) {
    throw new DispatchWarehouseCompanyMismatchError(bodegaId, empresaId);
  }
  return bodega;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Error desconocido durante la operación.';
}
