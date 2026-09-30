import { BodegaDirectoryPort } from '../../bodegas/application/ports/bodega-directory.port';
import { BodegaDirectoryEntry } from '../../bodegas/application/models/bodega.models';
import { MovimientoInventario } from '../domain/entities/movimiento-inventario.entity';
import { ReservaInventario } from '../domain/entities/reserva-inventario.entity';
import { StockBodega } from '../domain/entities/stock-bodega.entity';
import { InventoryConcurrentModificationError } from '../domain/errors/inventory.errors';
import {
  OrderDetailInventoryContext,
  ProductCatalogEntry,
} from '../domain/inventory.types';
import {
  InventoryRepositoryPort,
  InventoryTransactionPort,
} from '../domain/ports/inventory.repository.port';
import { ProductCatalogPort } from '../domain/ports/product-catalog.port';

export class FakeBodegaDirectory implements BodegaDirectoryPort {
  entries = new Map<number, BodegaDirectoryEntry>();
  principalId: number | null = null;

  add(entry: BodegaDirectoryEntry): void {
    this.entries.set(entry.id, entry);
    if (entry.esPrincipal) this.principalId = entry.id;
  }

  async findById(id: number): Promise<BodegaDirectoryEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async findPrincipal(): Promise<BodegaDirectoryEntry | null> {
    return this.principalId === null
      ? null
      : (this.entries.get(this.principalId) ?? null);
  }
}

export class FakeProductCatalog implements ProductCatalogPort {
  entries = new Map<number, ProductCatalogEntry>();

  add(entry: ProductCatalogEntry): void {
    this.entries.set(entry.id, entry);
  }

  async findById(id: number): Promise<ProductCatalogEntry | null> {
    return this.entries.get(id) ?? null;
  }
}

export class InMemoryInventoryRepository implements InventoryRepositoryPort {
  stocks = new Map<number, StockBodega>();
  reservations = new Map<number, ReservaInventario>();
  movements = new Map<number, MovimientoInventario>();
  orderDetails = new Map<number, OrderDetailInventoryContext>();

  private stockSequence = 1;
  private reservationSequence = 1;
  private movementSequence = 1;

  async transaction<T>(
    work: (tx: InventoryTransactionPort) => Promise<T>,
  ): Promise<T> {
    return work(this.transactionPort());
  }

  seedStock(stock: StockBodega): StockBodega {
    const id = stock.id ?? this.stockSequence++;

    const persisted = StockBodega.rehydrate({
      id,
      bodegaId: stock.bodegaId,
      productoId: stock.productoId,
      cantidadReal: stock.cantidadReal,
      cantidadReservada: stock.cantidadReservada,
      cantidadDisponible: stock.cantidadDisponible,
      costoPromedio: stock.costoPromedio,
      version: stock.version,
      creadoEn: stock.creadoEn,
      actualizadoEn: stock.actualizadoEn,
    });

    this.stockSequence = Math.max(this.stockSequence, id + 1);

    this.stocks.set(id, persisted);

    return this.cloneStock(persisted);
  }

  seedOrderDetail(detail: OrderDetailInventoryContext): void {
    this.orderDetails.set(detail.id, { ...detail });
  }

  private cloneStock(stock: StockBodega): StockBodega {
    return StockBodega.rehydrate({
      id: stock.id,
      bodegaId: stock.bodegaId,
      productoId: stock.productoId,
      cantidadReal: stock.cantidadReal,
      cantidadReservada: stock.cantidadReservada,
      cantidadDisponible: stock.cantidadDisponible,
      costoPromedio: stock.costoPromedio,
      version: stock.version,
      creadoEn: stock.creadoEn,
      actualizadoEn: stock.actualizadoEn,
    });
  }

  private cloneReservation(reservation: ReservaInventario): ReservaInventario {
    return ReservaInventario.rehydrate({
      id: reservation.id,
      pedidoDetalleId: reservation.pedidoDetalleId,
      stockBodegaId: reservation.stockBodegaId,
      cantidadOriginal: reservation.cantidadOriginal,
      cantidadPendiente: reservation.cantidadPendiente,
      cantidadAplicada: reservation.cantidadAplicada,
      cantidadLiberada: reservation.cantidadLiberada,
      estado: reservation.estado,
      aplicadaEn: reservation.aplicadaEn,
      liberadaEn: reservation.liberadaEn,
      cerradaEn: reservation.cerradaEn,
      canceladaEn: reservation.canceladaEn,
      version: reservation.version,
      creadoEn: reservation.creadoEn,
      actualizadoEn: reservation.actualizadoEn,
    });
  }

  private transactionPort(): InventoryTransactionPort {
    return {
      findStockByBodegaProducto: async (bodegaId, productoId) => {
        const found = [...this.stocks.values()].find(
          (stock) =>
            stock.bodegaId === bodegaId && stock.productoId === productoId,
        );
        return found ? this.cloneStock(found) : null;
      },

      findStockById: async (id) => {
        const found = this.stocks.get(id);
        return found ? this.cloneStock(found) : null;
      },

      // createStock: async (stock) => this.seedStock(stock),

      createStock: async (stock) => {
        const persisted = this.seedStock(stock);
        return this.cloneStock(persisted);
      },

      saveStock: async (stock, expectedVersion) => {
        if (!stock.id) throw new Error('Stock sin id.');
        const current = this.stocks.get(stock.id);
        if (!current || current.version !== expectedVersion) {
          throw new InventoryConcurrentModificationError({
            stockId: stock.id,
            expectedVersion,
          });
        }
        const persisted = this.cloneStock(stock);
        this.stocks.set(stock.id, persisted);
        return this.cloneStock(persisted);
      },

      findReservationById: async (id) => {
        const found = this.reservations.get(id);
        return found ? this.cloneReservation(found) : null;
      },

      findReservationByOrderDetailAndStock: async (
        pedidoDetalleId,
        stockBodegaId,
      ) => {
        const found = [...this.reservations.values()].find(
          (reservation) =>
            reservation.pedidoDetalleId === pedidoDetalleId &&
            reservation.stockBodegaId === stockBodegaId,
        );
        return found ? this.cloneReservation(found) : null;
      },

      createReservation: async (reservation) => {
        const id = reservation.id ?? this.reservationSequence++;
        const persisted = ReservaInventario.rehydrate({
          id,
          pedidoDetalleId: reservation.pedidoDetalleId,
          stockBodegaId: reservation.stockBodegaId,
          cantidadOriginal: reservation.cantidadOriginal,
          cantidadPendiente: reservation.cantidadPendiente,
          cantidadAplicada: reservation.cantidadAplicada,
          cantidadLiberada: reservation.cantidadLiberada,
          estado: reservation.estado,
          aplicadaEn: reservation.aplicadaEn,
          liberadaEn: reservation.liberadaEn,
          cerradaEn: reservation.cerradaEn,
          canceladaEn: reservation.canceladaEn,
          version: reservation.version,
          creadoEn: reservation.creadoEn,
          actualizadoEn: reservation.actualizadoEn,
        });
        this.reservationSequence = Math.max(this.reservationSequence, id + 1);
        this.reservations.set(id, persisted);
        return persisted;
      },

      saveReservation: async (reservation, expectedVersion) => {
        if (!reservation.id) throw new Error('Reserva sin id.');
        const current = this.reservations.get(reservation.id);
        if (!current || current.version !== expectedVersion) {
          throw new InventoryConcurrentModificationError({
            reservationId: reservation.id,
            expectedVersion,
          });
        }
        const persisted = this.cloneReservation(reservation);
        this.reservations.set(reservation.id, persisted);
        return this.cloneReservation(persisted);
      },

      createMovement: async (movement) => {
        if (movement.claveIdempotencia) {
          const existing = [...this.movements.values()].find(
            (item) => item.claveIdempotencia === movement.claveIdempotencia,
          );
          if (existing) {
            throw new InventoryConcurrentModificationError({
              claveIdempotencia: movement.claveIdempotencia,
            });
          }
        }

        const id = movement.id ?? this.movementSequence++;
        const persisted = MovimientoInventario.rehydrate({
          id,
          bodegaId: movement.bodegaId,
          productoId: movement.productoId,
          proveedorId: movement.proveedorId,
          creadoPorId: movement.creadoPorId,
          reservaInventarioId: movement.reservaInventarioId,
          tipo: movement.tipo,
          cantidad: movement.cantidad,
          costoUnitario: movement.costoUnitario,
          costoPromedioAntes: movement.costoPromedioAntes,
          costoPromedioDespues: movement.costoPromedioDespues,
          cantidadRealAntes: movement.cantidadRealAntes,
          cantidadRealDespues: movement.cantidadRealDespues,
          reservadaAntes: movement.reservadaAntes,
          reservadaDespues: movement.reservadaDespues,
          referenciaTipo: movement.referenciaTipo,
          referenciaId: movement.referenciaId,
          claveIdempotencia: movement.claveIdempotencia,
          observaciones: movement.observaciones,
          creadoEn: movement.creadoEn ?? new Date(),
        });
        this.movementSequence = Math.max(this.movementSequence, id + 1);
        this.movements.set(id, persisted);
        return persisted;
      },

      findMovementByIdempotencyKey: async (key) =>
        [...this.movements.values()].find(
          (movement) => movement.claveIdempotencia === key,
        ) ?? null,

      findOrderDetailContext: async (id) => this.orderDetails.get(id) ?? null,

      setOrderDetailReserved: async (
        pedidoDetalleId,
        expectedReserved,
        nextReserved,
      ) => {
        const current = this.orderDetails.get(pedidoDetalleId);
        if (!current || current.cantidadReservada !== expectedReserved) {
          throw new InventoryConcurrentModificationError({
            pedidoDetalleId,
            expectedReserved,
          });
        }
        this.orderDetails.set(pedidoDetalleId, {
          ...current,
          cantidadReservada: nextReserved,
        });
      },
    };
  }
}
