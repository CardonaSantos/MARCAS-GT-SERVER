import { BodegaDirectoryPort } from '../../../bodegas';
import { InventoryAvailabilityPort } from '../../../inventario';
import { TransferValidationError } from '../../domain/errors/transfer.errors';
import { TransferActorDirectoryPort } from '../../domain/ports/transfer-actor-directory.port';

export async function requireActiveTransferActor(
  users: TransferActorDirectoryPort,
  actorId: number,
) {
  const actor = await users.findById(actorId);
  if (!actor || !actor.activo) {
    throw new TransferValidationError(
      'El usuario no existe o está inactivo.',
      { actorId },
    );
  }
  if (!actor.empresaId) {
    throw new TransferValidationError(
      'El usuario no tiene empresa asociada.',
      { actorId },
    );
  }
  return actor;
}

export async function requireTransferWarehouses(
  bodegas: BodegaDirectoryPort,
  bodegaOrigenId: number,
  bodegaDestinoId: number,
) {
  if (bodegaOrigenId === bodegaDestinoId) {
    throw new TransferValidationError(
      'La bodega origen y la bodega destino deben ser diferentes.',
    );
  }

  const [origen, destino] = await Promise.all([
    bodegas.findById(bodegaOrigenId),
    bodegas.findById(bodegaDestinoId),
  ]);

  if (!origen) {
    throw new TransferValidationError('La bodega origen no existe.', {
      bodegaOrigenId,
    });
  }
  if (!destino) {
    throw new TransferValidationError('La bodega destino no existe.', {
      bodegaDestinoId,
    });
  }
  if (!origen.activo) {
    throw new TransferValidationError('La bodega origen está inactiva.', {
      bodegaOrigenId,
    });
  }
  if (!destino.activo) {
    throw new TransferValidationError('La bodega destino está inactiva.', {
      bodegaDestinoId,
    });
  }

  return { origen, destino };
}

export async function requireActiveDestinationWarehouse(
  bodegas: BodegaDirectoryPort,
  bodegaDestinoId: number,
) {
  const destino = await bodegas.findById(bodegaDestinoId);
  if (!destino) {
    throw new TransferValidationError('La bodega destino no existe.', {
      bodegaDestinoId,
    });
  }
  if (!destino.activo) {
    throw new TransferValidationError('La bodega destino está inactiva.', {
      bodegaDestinoId,
    });
  }
  return destino;
}

export async function requireTransferProducts(
  inventory: InventoryAvailabilityPort,
  productIds: number[],
): Promise<void> {
  const unique = [...new Set(productIds)];
  const entries = await Promise.all(
    unique.map((id) => inventory.getProductAvailability(id)),
  );

  for (let index = 0; index < unique.length; index += 1) {
    if (!entries[index]) {
      throw new TransferValidationError('El producto no existe.', {
        productoId: unique[index],
      });
    }
  }
}
