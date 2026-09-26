import { BodegaDirectoryPort } from '../../../bodegas/application/ports/bodega-directory.port';
import { MovimientoInventario } from '../../domain/entities/movimiento-inventario.entity';
import { ReservaInventario } from '../../domain/entities/reserva-inventario.entity';
import { StockBodega } from '../../domain/entities/stock-bodega.entity';
import {
  InventoryOrderDetailCapacityExceededError,
  InventoryOrderDetailNotFoundError,
} from '../../domain/errors/inventory.errors';
import { InventoryRepositoryPort } from '../../domain/ports/inventory.repository.port';
import { ProductCatalogPort } from '../../domain/ports/product-catalog.port';
import { ReserveInventoryCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';
import {
  assertOperationalBodega,
  assertProduct,
  withOptimisticRetry,
} from './inventory-use-case.helpers';

export class ReserveInventoryUseCase {
  constructor(
    private readonly repository: InventoryRepositoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly products: ProductCatalogPort,
    private readonly coordinator: InventoryMutationCoordinator,
  ) {}

  async execute(command: ReserveInventoryCommand) {
    await assertOperationalBodega(this.bodegas, command.bodegaId);

    return withOptimisticRetry(() =>
      this.repository.transaction(async (tx) => {
        const repeated = await this.coordinator.resolveIdempotent(
          tx,
          command.claveIdempotencia,
        );
        if (repeated) return repeated;

        const detail = await tx.findOrderDetailContext(command.pedidoDetalleId);
        if (!detail) {
          throw new InventoryOrderDetailNotFoundError(command.pedidoDetalleId);
        }

        await assertProduct(this.products, detail.productoId);

        const capacity =
          detail.cantidadSolicitada -
          detail.cantidadReservada -
          detail.cantidadDespachada;

        if (command.cantidad > capacity) {
          throw new InventoryOrderDetailCapacityExceededError(
            capacity,
            command.cantidad,
          );
        }

        let stock = await tx.findStockByBodegaProducto(
          command.bodegaId,
          detail.productoId,
        );

        if (!stock) {
          stock = await tx.createStock(
            StockBodega.create(command.bodegaId, detail.productoId),
          );
        }

        const stockExpectedVersion = stock.version;
        const before = stock.snapshot();
        stock.reserve(command.cantidad);
        const persistedStock = await tx.saveStock(
          stock,
          stockExpectedVersion,
        );

        let reservation = await tx.findReservationByOrderDetailAndStock(
          command.pedidoDetalleId,
          persistedStock.id!,
        );

        if (reservation) {
          const reservationExpectedVersion = reservation.version;
          reservation.increase(command.cantidad);
          reservation = await tx.saveReservation(
            reservation,
            reservationExpectedVersion,
          );
        } else {
          reservation = await tx.createReservation(
            ReservaInventario.create(
              command.pedidoDetalleId,
              persistedStock.id!,
              command.cantidad,
            ),
          );
        }

        await tx.setOrderDetailReserved(
          detail.id,
          detail.cantidadReservada,
          detail.cantidadReservada + command.cantidad,
        );

        const movement = await tx.createMovement(
          MovimientoInventario.create({
            bodegaId: command.bodegaId,
            productoId: detail.productoId,
            creadoPorId: command.actorId,
            reservaInventarioId: reservation.id!,
            tipo: 'RESERVA',
            cantidad: command.cantidad,
            before,
            after: persistedStock.snapshot(),
            reference: {
              type: 'PEDIDO_DETALLE',
              id: command.pedidoDetalleId,
            },
            claveIdempotencia: command.claveIdempotencia,
          }),
        );

        return this.coordinator.result(
          persistedStock,
          movement.id!,
          reservation.id!,
          false,
        );
      }),
    );
  }
}
