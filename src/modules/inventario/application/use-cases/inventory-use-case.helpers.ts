import { BodegaDirectoryPort } from '../../../bodegas/application/ports/bodega-directory.port';
import {
  InventoryBodegaInactiveError,
  InventoryBodegaNotFoundError,
  InventoryConcurrentModificationError,
  InventoryProductNotFoundError,
} from '../../domain/errors/inventory.errors';
import { ProductCatalogPort } from '../../domain/ports/product-catalog.port';

export async function assertOperationalBodega(
  bodegas: BodegaDirectoryPort,
  bodegaId: number,
): Promise<void> {
  const bodega = await bodegas.findById(bodegaId);
  if (!bodega) throw new InventoryBodegaNotFoundError(bodegaId);
  if (!bodega.activo) throw new InventoryBodegaInactiveError(bodegaId);
}

export async function assertProduct(
  products: ProductCatalogPort,
  productoId: number,
): Promise<void> {
  const product = await products.findById(productoId);
  if (!product) throw new InventoryProductNotFoundError(productoId);
}

export async function withOptimisticRetry<T>(
  work: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (!(error instanceof InventoryConcurrentModificationError) || attempt === attempts) {
        throw error;
      }
    }
  }

  throw lastError;
}
