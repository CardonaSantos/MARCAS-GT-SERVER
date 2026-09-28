import { BodegaDirectoryPort } from '../../../bodegas';
import {
  RequisitionCatalogPort,
  RequisitionProductEntry,
} from '../../domain/ports/requisition-catalog.port';
import { RequisitionActorDirectoryPort } from '../../domain/ports/requisition-actor-directory.port';
import { RequisitionValidationError } from '../../domain/errors/requisition.errors';

export async function requireActiveActor(
  users: RequisitionActorDirectoryPort,
  actorId: number,
) {
  const actor = await users.findById(actorId);
  if (!actor || !actor.activo) {
    throw new RequisitionValidationError('El usuario no existe o está inactivo.');
  }
  if (!actor.empresaId) {
    throw new RequisitionValidationError(
      'El usuario no tiene empresa asociada.',
      { actorId },
    );
  }
  return actor;
}

export async function requireActiveWarehouse(
  bodegas: BodegaDirectoryPort,
  id: number,
) {
  const bodega = await bodegas.findById(id);
  if (!bodega) {
    throw new RequisitionValidationError('La bodega destino no existe.', { id });
  }
  if (!bodega.activo) {
    throw new RequisitionValidationError('La bodega destino está inactiva.', { id });
  }
  return bodega;
}

export async function requireProvider(
  catalog: RequisitionCatalogPort,
  id: number,
) {
  const provider = await catalog.findProvider(id);
  if (!provider) {
    throw new RequisitionValidationError('El proveedor no existe.', { id });
  }
  if (!provider.activo) {
    throw new RequisitionValidationError('El proveedor está inactivo.', { id });
  }
  return provider;
}

export async function requireProducts(
  catalog: RequisitionCatalogPort,
  ids: number[],
): Promise<Map<number, RequisitionProductEntry>> {
  const unique = [...new Set(ids)];
  const entries = await Promise.all(unique.map((id) => catalog.findProduct(id)));
  const result = new Map<number, RequisitionProductEntry>();
  for (let index = 0; index < unique.length; index += 1) {
    const product = entries[index];
    if (!product) {
      throw new RequisitionValidationError('El producto no existe.', {
        productoId: unique[index],
      });
    }
    result.set(product.id, product);
  }
  return result;
}
