import { InventoryReservationState } from '../../domain/inventory.types';

export type InventoryReservationDirectoryEntry = Readonly<{
  id: number;
  pedidoDetalleId: number;
  stockBodegaId: number;
  bodegaId: number;
  productoId: number;
  cantidadOriginal: number;
  cantidadPendiente: number;
  cantidadAplicada: number;
  cantidadLiberada: number;
  estado: InventoryReservationState;
  version: number;
}>;

export interface InventoryReservationDirectoryPort {
  findByOrderDetailAndBodega(
    pedidoDetalleId: number,
    bodegaId: number,
  ): Promise<InventoryReservationDirectoryEntry | null>;
}
