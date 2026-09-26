import { MovimientoInventario } from '../../domain/entities/movimiento-inventario.entity';
import {
  InvalidInventoryAdjustmentReasonError,
  InventoryConcurrentModificationError,
  InventoryOrderDetailNotFoundError,
  InventoryReservationNotFoundError,
  InventoryStockNotFoundError,
} from '../../domain/errors/inventory.errors';
import { InventoryRepositoryPort } from '../../domain/ports/inventory.repository.port';
import { CancelReservationCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';
import { withOptimisticRetry } from './inventory-use-case.helpers';

export class CancelInventoryReservationUseCase {
  constructor(
    private readonly repository: InventoryRepositoryPort,
    private readonly coordinator: InventoryMutationCoordinator,
  ) {}

  execute(command: CancelReservationCommand) {
    if (!command.motivo || command.motivo.trim().length < 3) {
      throw new InvalidInventoryAdjustmentReasonError();
    }

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

        const stock = await tx.findStockById(reservation.stockBodegaId);
        if (!stock) {
          throw new InventoryStockNotFoundError({
            stockBodegaId: reservation.stockBodegaId,
          });
        }

        const stockExpected = stock.version;
        const reservationExpected = reservation.version;
        const before = stock.snapshot();
        const released = reservation.cantidadPendiente;

        if (released > detail.cantidadReservada) {
          throw new InventoryConcurrentModificationError({
            pedidoDetalleId: detail.id,
            cantidadReservada: detail.cantidadReservada,
            requested: released,
          });
        }

        reservation.cancel();
        stock.releaseReservation(released);

        const persistedStock = await tx.saveStock(stock, stockExpected);
        reservation = await tx.saveReservation(
          reservation,
          reservationExpected,
        );

        await tx.setOrderDetailReserved(
          detail.id,
          detail.cantidadReservada,
          detail.cantidadReservada - released,
        );

        const movement = await tx.createMovement(
          MovimientoInventario.create({
            bodegaId: persistedStock.bodegaId,
            productoId: persistedStock.productoId,
            creadoPorId: command.actorId,
            reservaInventarioId: reservation.id!,
            tipo: 'LIBERACION_RESERVA',
            cantidad: released,
            before,
            after: persistedStock.snapshot(),
            reference:
              command.reference ?? {
                type: 'PEDIDO_DETALLE',
                id: reservation.pedidoDetalleId,
              },
            observaciones: command.motivo,
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
