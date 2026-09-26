import { MovimientoInventario } from '../entities/movimiento-inventario.entity';
import { ReservaInventario } from '../entities/reserva-inventario.entity';
import { StockBodega } from '../entities/stock-bodega.entity';
import { OrderDetailInventoryContext } from '../inventory.types';

export interface InventoryTransactionPort {
  findStockByBodegaProducto(bodegaId: number, productoId: number): Promise<StockBodega | null>;
  findStockById(stockBodegaId: number): Promise<StockBodega | null>;
  createStock(stock: StockBodega): Promise<StockBodega>;
  saveStock(stock: StockBodega, expectedVersion: number): Promise<StockBodega>;

  findReservationById(id: number): Promise<ReservaInventario | null>;
  findReservationByOrderDetailAndStock(
    pedidoDetalleId: number,
    stockBodegaId: number,
  ): Promise<ReservaInventario | null>;
  createReservation(reservation: ReservaInventario): Promise<ReservaInventario>;
  saveReservation(reservation: ReservaInventario, expectedVersion: number): Promise<ReservaInventario>;

  createMovement(movement: MovimientoInventario): Promise<MovimientoInventario>;
  findMovementByIdempotencyKey(key: string): Promise<MovimientoInventario | null>;

  findOrderDetailContext(pedidoDetalleId: number): Promise<OrderDetailInventoryContext | null>;
  setOrderDetailReserved(
    pedidoDetalleId: number,
    expectedReserved: number,
    nextReserved: number,
  ): Promise<void>;
}

export interface InventoryRepositoryPort {
  transaction<T>(work: (tx: InventoryTransactionPort) => Promise<T>): Promise<T>;
}
