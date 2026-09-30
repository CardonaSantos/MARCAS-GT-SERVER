import {
  MovimientoInventario as PrismaMovimiento,
  ReservaInventario as PrismaReserva,
  StockBodega as PrismaStock,
} from '@prisma/client';
import { MovimientoInventario } from '../../../domain/entities/movimiento-inventario.entity';
import { ReservaInventario } from '../../../domain/entities/reserva-inventario.entity';
import { StockBodega } from '../../../domain/entities/stock-bodega.entity';
import {
  InventoryMovementType,
  InventoryReservationState,
} from '../../../domain/inventory.types';
import { InventoryCost } from '../../../domain/value-objects/inventory-cost.vo';

export class InventoryPrismaMapper {
  static stockToDomain(row: PrismaStock): StockBodega {
    return StockBodega.rehydrate({
      id: row.id,
      bodegaId: row.bodegaId,
      productoId: row.productoId,
      cantidadReal: row.cantidadReal,
      cantidadReservada: row.cantidadReservada,
      cantidadDisponible: row.cantidadDisponible,
      costoPromedio: InventoryCost.from(row.costoPromedio.toFixed(4)),
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    });
  }

  static reservationToDomain(row: PrismaReserva): ReservaInventario {
    return ReservaInventario.rehydrate({
      id: row.id,
      pedidoDetalleId: row.pedidoDetalleId,
      stockBodegaId: row.stockBodegaId,
      cantidadOriginal: row.cantidadOriginal,
      cantidadPendiente: row.cantidadPendiente,
      cantidadAplicada: row.cantidadAplicada,
      cantidadLiberada: row.cantidadLiberada,
      estado: row.estado as InventoryReservationState,
      aplicadaEn: row.aplicadaEn,
      liberadaEn: row.liberadaEn,
      cerradaEn: row.cerradaEn,
      canceladaEn: row.canceladaEn,
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    });
  }

  static movementToDomain(row: PrismaMovimiento): MovimientoInventario {
    return MovimientoInventario.rehydrate({
      id: row.id,
      bodegaId: row.bodegaId,
      productoId: row.productoId,
      proveedorId: row.proveedorId,
      creadoPorId: row.creadoPorId,
      reservaInventarioId: row.reservaInventarioId,
      tipo: row.tipo as InventoryMovementType,
      cantidad: row.cantidad,
      costoUnitario: row.costoUnitario
        ? InventoryCost.from(row.costoUnitario.toFixed(4))
        : null,
      costoPromedioAntes: InventoryCost.from(
        row.costoPromedioAntes.toFixed(4),
      ),
      costoPromedioDespues: InventoryCost.from(
        row.costoPromedioDespues.toFixed(4),
      ),
      cantidadRealAntes: row.cantidadRealAntes,
      cantidadRealDespues: row.cantidadRealDespues,
      reservadaAntes: row.reservadaAntes,
      reservadaDespues: row.reservadaDespues,
      referenciaTipo: row.referenciaTipo,
      referenciaId: row.referenciaId,
      claveIdempotencia: row.claveIdempotencia,
      observaciones: row.observaciones,
      creadoEn: row.creadoEn,
    });
  }
}
