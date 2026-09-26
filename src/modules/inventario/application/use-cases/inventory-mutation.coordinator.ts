import { BodegaDirectoryPort } from '../../../bodegas/application/ports/bodega-directory.port';
import { MovimientoInventario } from '../../domain/entities/movimiento-inventario.entity';
import { StockBodega } from '../../domain/entities/stock-bodega.entity';
import { InvalidInventoryAdjustmentReasonError } from '../../domain/errors/inventory.errors';
import { InventoryMovementType, InventoryReference } from '../../domain/inventory.types';
import {
  InventoryRepositoryPort,
  InventoryTransactionPort,
} from '../../domain/ports/inventory.repository.port';
import { ProductCatalogPort } from '../../domain/ports/product-catalog.port';
import { InventoryCost } from '../../domain/value-objects/inventory-cost.vo';
import { InventoryMutationResult } from '../models/inventory.models';
import {
  assertOperationalBodega,
  assertProduct,
  withOptimisticRetry,
} from './inventory-use-case.helpers';

export class InventoryMutationCoordinator {
  constructor(
    private readonly repository: InventoryRepositoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly products: ProductCatalogPort,
  ) {}

  async mutateStock(input: {
    bodegaId: number;
    productoId: number;
    cantidad: number;
    movementType: InventoryMovementType;
    actorId: number;
    proveedorId?: number | null;
    unitCost?: string | null;
    reference?: InventoryReference | null;
    observaciones?: string | null;
    claveIdempotencia?: string | null;
    mutation: 'ENTRY' | 'AVAILABLE_EXIT';
    requireReason?: boolean;
  }): Promise<InventoryMutationResult> {
    await Promise.all([
      assertOperationalBodega(this.bodegas, input.bodegaId),
      assertProduct(this.products, input.productoId),
    ]);

    if (
      input.requireReason &&
      (!input.observaciones || input.observaciones.trim().length < 3)
    ) {
      throw new InvalidInventoryAdjustmentReasonError();
    }

    const unitCost =
      input.unitCost == null ? null : InventoryCost.from(input.unitCost);

    return withOptimisticRetry(() =>
      this.repository.transaction(async (tx) => {
        const repeated = await this.resolveIdempotent(
          tx,
          input.claveIdempotencia,
        );
        if (repeated) return repeated;

        let stock = await tx.findStockByBodegaProducto(
          input.bodegaId,
          input.productoId,
        );

        if (!stock) {
          stock = await tx.createStock(
            StockBodega.create(input.bodegaId, input.productoId),
          );
        }

        const expectedVersion = stock.version;
        const before = stock.snapshot();

        if (input.mutation === 'ENTRY') {
          stock.registerEntry(input.cantidad, unitCost);
        } else {
          stock.registerAvailableExit(input.cantidad);
        }

        const persisted = await tx.saveStock(stock, expectedVersion);
        const after = persisted.snapshot();

        const movement = await tx.createMovement(
          MovimientoInventario.create({
            bodegaId: input.bodegaId,
            productoId: input.productoId,
            proveedorId: input.proveedorId,
            creadoPorId: input.actorId,
            tipo: input.movementType,
            cantidad: input.cantidad,
            costoUnitario:
              unitCost ??
              (input.mutation === 'AVAILABLE_EXIT'
                ? InventoryCost.from(before.costoPromedio)
                : null),
            before,
            after,
            reference: input.reference,
            claveIdempotencia: input.claveIdempotencia,
            observaciones: input.observaciones,
          }),
        );

        return this.result(persisted, movement.id!, null, false);
      }),
    );
  }

  async resolveIdempotent(
    tx: InventoryTransactionPort,
    key?: string | null,
  ): Promise<InventoryMutationResult | null> {
    const normalized = key?.trim();
    if (!normalized) return null;

    const movement = await tx.findMovementByIdempotencyKey(normalized);
    if (!movement) return null;

    const stock = await tx.findStockByBodegaProducto(
      movement.bodegaId,
      movement.productoId,
    );

    if (!stock || !movement.id) return null;

    return this.result(
      stock,
      movement.id,
      movement.reservaInventarioId,
      true,
    );
  }

  result(
    stock: StockBodega,
    movimientoId: number,
    reservaId: number | null,
    repeated: boolean,
  ): InventoryMutationResult {
    if (!stock.id) throw new Error('El stock persistido no tiene id.');

    return {
      repeated,
      stockId: stock.id,
      movimientoId,
      reservaId,
      snapshot: stock.snapshot(),
    };
  }
}
