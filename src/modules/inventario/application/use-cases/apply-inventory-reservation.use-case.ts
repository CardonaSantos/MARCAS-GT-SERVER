import { MovimientoInventario } from '../../domain/entities/movimiento-inventario.entity';
import {
  InventoryConcurrentModificationError,
  InventoryOrderDetailNotFoundError,
  InventoryReservationNotFoundError,
  InventoryStockNotFoundError,
} from '../../domain/errors/inventory.errors';
import { InventoryRepositoryPort } from '../../domain/ports/inventory.repository.port';
import { InventoryCost } from '../../domain/value-objects/inventory-cost.vo';
import { ReservationMutationCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';
import { withOptimisticRetry } from './inventory-use-case.helpers';

export class ApplyInventoryReservationUseCase {
  constructor(
    private readonly repository: InventoryRepositoryPort,
    private readonly coordinator: InventoryMutationCoordinator,
  ) {}

  execute(command: ReservationMutationCommand) {
    return withOptimisticRetry(() =>
      this.repository.transaction(async (tx) => {
        const repeated = await this.coordinator.resolveIdempotent(
          tx,
          command.claveIdempotencia,
        );
        if (repeated) return repeated;

        let reservation = await tx.findReservationById(command.reservaId);
        if (!reservation) {
          throw new InventoryReservationNotFoundError(command.reservaId);
        }

        const detail = await tx.findOrderDetailContext(
          reservation.pedidoDetalleId,
        );
        if (!detail) {
          throw new InventoryOrderDetailNotFoundError(
            reservation.pedidoDetalleId,
          );
        }
        if (command.cantidad > detail.cantidadReservada) {
          throw new InventoryConcurrentModificationError({
            pedidoDetalleId: detail.id,
            cantidadReservada: detail.cantidadReservada,
            requested: command.cantidad,
          });
        }

        const stock = await tx.findStockById(reservation.stockBodegaId);
        if (!stock) {
          throw new InventoryStockNotFoundError({
            stockBodegaId: reservation.stockBodegaId,
          });
        }

        const stockExpected = stock.version;
        const reservationExpected = reservation.version;
        const before = stock.snapshot();

        reservation.apply(command.cantidad);
        stock.applyReservedExit(command.cantidad);

        const persistedStock = await tx.saveStock(stock, stockExpected);
        reservation = await tx.saveReservation(
          reservation,
          reservationExpected,
        );

        await tx.setOrderDetailReserved(
          detail.id,
          detail.cantidadReservada,
          detail.cantidadReservada - command.cantidad,
        );

        const movement = await tx.createMovement(
          MovimientoInventario.create({
            bodegaId: persistedStock.bodegaId,
            productoId: persistedStock.productoId,
            creadoPorId: command.actorId,
            reservaInventarioId: reservation.id!,
            tipo: 'SALIDA_DESPACHO',
            cantidad: command.cantidad,
            costoUnitario: InventoryCost.from(before.costoPromedio),
            before,
            after: persistedStock.snapshot(),
            reference:
              command.reference ?? {
                type: 'PEDIDO_DETALLE',
                id: reservation.pedidoDetalleId,
              },
            observaciones: command.observaciones,
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
