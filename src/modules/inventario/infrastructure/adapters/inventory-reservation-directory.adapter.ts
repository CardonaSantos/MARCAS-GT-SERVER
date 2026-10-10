import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  InventoryReservationDirectoryEntry,
  InventoryReservationDirectoryPort,
} from '../../application/ports/inventory-reservation-directory.port';
import { InventoryReservationState } from '../../domain/inventory.types';

@Injectable()
export class InventoryReservationDirectoryAdapter
  implements InventoryReservationDirectoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderDetailAndBodega(
    pedidoDetalleId: number,
    bodegaId: number,
  ): Promise<InventoryReservationDirectoryEntry | null> {
    const row = await this.prisma.reservaInventario.findFirst({
      where: {
        pedidoDetalleId,
        stockBodega: { is: { bodegaId } },
      },
      include: {
        stockBodega: {
          select: {
            id: true,
            bodegaId: true,
            productoId: true,
          },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      pedidoDetalleId: row.pedidoDetalleId,
      stockBodegaId: row.stockBodegaId,
      bodegaId: row.stockBodega.bodegaId,
      productoId: row.stockBodega.productoId,
      cantidadOriginal: row.cantidadOriginal,
      cantidadPendiente: row.cantidadPendiente,
      cantidadAplicada: row.cantidadAplicada,
      cantidadLiberada: row.cantidadLiberada,
      estado: row.estado as InventoryReservationState,
      version: row.version,
    };
  }
}
