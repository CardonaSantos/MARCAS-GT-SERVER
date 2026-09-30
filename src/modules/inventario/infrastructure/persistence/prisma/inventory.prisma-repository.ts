import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { MovimientoInventario } from '../../../domain/entities/movimiento-inventario.entity';
import { ReservaInventario } from '../../../domain/entities/reserva-inventario.entity';
import { StockBodega } from '../../../domain/entities/stock-bodega.entity';
import { InventoryConcurrentModificationError } from '../../../domain/errors/inventory.errors';
import { OrderDetailInventoryContext } from '../../../domain/inventory.types';
import {
  InventoryRepositoryPort,
  InventoryTransactionPort,
} from '../../../domain/ports/inventory.repository.port';
import { InventoryPrismaMapper } from './inventory.prisma-mapper';

class PrismaInventoryTransaction implements InventoryTransactionPort {
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  async findStockByBodegaProducto(bodegaId: number, productoId: number) {
    const row = await this.prisma.stockBodega.findUnique({
      where: {
        bodegaId_productoId: {
          bodegaId,
          productoId,
        },
      },
    });

    return row ? InventoryPrismaMapper.stockToDomain(row) : null;
  }

  async findStockById(stockBodegaId: number) {
    const row = await this.prisma.stockBodega.findUnique({
      where: { id: stockBodegaId },
    });

    return row ? InventoryPrismaMapper.stockToDomain(row) : null;
  }

  async createStock(stock: StockBodega): Promise<StockBodega> {
    try {
      const row = await this.prisma.stockBodega.create({
        data: {
          bodegaId: stock.bodegaId,
          productoId: stock.productoId,
          cantidadReal: stock.cantidadReal,
          cantidadReservada: stock.cantidadReservada,
          cantidadDisponible: stock.cantidadDisponible,
          costoPromedio: stock.costoPromedio.toString(),
          version: stock.version,
        },
      });

      return InventoryPrismaMapper.stockToDomain(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new InventoryConcurrentModificationError({
          bodegaId: stock.bodegaId,
          productoId: stock.productoId,
        });
      }
      throw error;
    }
  }

  async saveStock(
    stock: StockBodega,
    expectedVersion: number,
  ): Promise<StockBodega> {
    if (!stock.id) throw new Error('No se puede guardar StockBodega sin id.');

    const result = await this.prisma.stockBodega.updateMany({
      where: {
        id: stock.id,
        version: expectedVersion,
      },
      data: {
        cantidadReal: stock.cantidadReal,
        cantidadReservada: stock.cantidadReservada,
        cantidadDisponible: stock.cantidadDisponible,
        costoPromedio: stock.costoPromedio.toString(),
        version: stock.version,
      },
    });

    if (result.count !== 1) {
      throw new InventoryConcurrentModificationError({
        stockId: stock.id,
        expectedVersion,
      });
    }

    const row = await this.prisma.stockBodega.findUniqueOrThrow({
      where: { id: stock.id },
    });

    return InventoryPrismaMapper.stockToDomain(row);
  }

  async findReservationById(id: number) {
    const row = await this.prisma.reservaInventario.findUnique({
      where: { id },
    });

    return row ? InventoryPrismaMapper.reservationToDomain(row) : null;
  }

  async findReservationByOrderDetailAndStock(
    pedidoDetalleId: number,
    stockBodegaId: number,
  ) {
    const row = await this.prisma.reservaInventario.findUnique({
      where: {
        pedidoDetalleId_stockBodegaId: {
          pedidoDetalleId,
          stockBodegaId,
        },
      },
    });

    return row ? InventoryPrismaMapper.reservationToDomain(row) : null;
  }

  async createReservation(
    reservation: ReservaInventario,
  ): Promise<ReservaInventario> {
    try {
      const row = await this.prisma.reservaInventario.create({
        data: {
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
        },
      });

      return InventoryPrismaMapper.reservationToDomain(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new InventoryConcurrentModificationError({
          pedidoDetalleId: reservation.pedidoDetalleId,
          stockBodegaId: reservation.stockBodegaId,
        });
      }
      throw error;
    }
  }

  async saveReservation(
    reservation: ReservaInventario,
    expectedVersion: number,
  ): Promise<ReservaInventario> {
    if (!reservation.id) {
      throw new Error('No se puede guardar ReservaInventario sin id.');
    }

    const result = await this.prisma.reservaInventario.updateMany({
      where: {
        id: reservation.id,
        version: expectedVersion,
      },
      data: {
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
      },
    });

    if (result.count !== 1) {
      throw new InventoryConcurrentModificationError({
        reservationId: reservation.id,
        expectedVersion,
      });
    }

    const row = await this.prisma.reservaInventario.findUniqueOrThrow({
      where: { id: reservation.id },
    });

    return InventoryPrismaMapper.reservationToDomain(row);
  }

  async createMovement(
    movement: MovimientoInventario,
  ): Promise<MovimientoInventario> {
    try {
      const row = await this.prisma.movimientoInventario.create({
        data: {
          bodegaId: movement.bodegaId,
          productoId: movement.productoId,
          proveedorId: movement.proveedorId,
          creadoPorId: movement.creadoPorId,
          reservaInventarioId: movement.reservaInventarioId,
          tipo: movement.tipo,
          cantidad: movement.cantidad,
          costoUnitario: movement.costoUnitario?.toString() ?? null,
          costoPromedioAntes: movement.costoPromedioAntes.toString(),
          costoPromedioDespues: movement.costoPromedioDespues.toString(),
          cantidadRealAntes: movement.cantidadRealAntes,
          cantidadRealDespues: movement.cantidadRealDespues,
          reservadaAntes: movement.reservadaAntes,
          reservadaDespues: movement.reservadaDespues,
          referenciaTipo: movement.referenciaTipo,
          referenciaId: movement.referenciaId,
          claveIdempotencia: movement.claveIdempotencia,
          observaciones: movement.observaciones,
        },
      });

      return InventoryPrismaMapper.movementToDomain(row);
    } catch (error) {
      if (
        movement.claveIdempotencia &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // La transacción se reintenta; en el siguiente intento el movimiento
        // ya es detectable por clave y se responde como idempotente.
        throw new InventoryConcurrentModificationError({
          claveIdempotencia: movement.claveIdempotencia,
        });
      }
      throw error;
    }
  }

  async findMovementByIdempotencyKey(key: string) {
    const row = await this.prisma.movimientoInventario.findUnique({
      where: { claveIdempotencia: key },
    });

    return row ? InventoryPrismaMapper.movementToDomain(row) : null;
  }

  async findOrderDetailContext(
    pedidoDetalleId: number,
  ): Promise<OrderDetailInventoryContext | null> {
    return this.prisma.pedidoDetalle.findUnique({
      where: { id: pedidoDetalleId },
      select: {
        id: true,
        pedidoId: true,
        productoId: true,
        cantidadSolicitada: true,
        cantidadReservada: true,
        cantidadDespachada: true,
      },
    });
  }

  async setOrderDetailReserved(
    pedidoDetalleId: number,
    expectedReserved: number,
    nextReserved: number,
  ): Promise<void> {
    const result = await this.prisma.pedidoDetalle.updateMany({
      where: {
        id: pedidoDetalleId,
        cantidadReservada: expectedReserved,
      },
      data: {
        cantidadReservada: nextReserved,
      },
    });

    if (result.count !== 1) {
      throw new InventoryConcurrentModificationError({
        pedidoDetalleId,
        expectedReserved,
      });
    }
  }
}

@Injectable()
export class InventoryPrismaRepository implements InventoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(
    work: (tx: InventoryTransactionPort) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      (prisma) => work(new PrismaInventoryTransaction(prisma)),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }
}
