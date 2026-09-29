import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { OrderProductCatalogPort } from '../../domain/ports/order-product-catalog.port';

@Injectable()
export class OrderProductCatalogPrismaAdapter implements OrderProductCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByIds(ids: number[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.producto.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigoProducto: true, nombre: true, precio: true },
    });
    return rows.map((row) => ({
      id: row.id,
      codigo: row.codigoProducto,
      nombre: row.nombre,
      precio: Number(row.precio).toFixed(2),
    }));
  }
}
