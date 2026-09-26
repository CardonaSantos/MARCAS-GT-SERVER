import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ProductCatalogPort } from '../../domain/ports/product-catalog.port';

@Injectable()
export class ProductCatalogPrismaAdapter implements ProductCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const product = await this.prisma.producto.findUnique({
      where: { id },
      select: { id: true, codigoProducto: true, nombre: true },
    });

    return product
      ? {
          id: product.id,
          codigo: product.codigoProducto,
          nombre: product.nombre,
        }
      : null;
  }
}
