import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RequisitionCatalogPort } from '../../domain/ports/requisition-catalog.port';

@Injectable()
export class RequisitionCatalogPrismaAdapter implements RequisitionCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  findProduct(id: number) {
    return this.prisma.producto.findUnique({
      where: { id },
      select: { id: true, codigoProducto: true, nombre: true },
    }).then((row) =>
      row
        ? { id: row.id, codigo: row.codigoProducto, nombre: row.nombre }
        : null,
    );
  }

  findProvider(id: number) {
    return this.prisma.proveedor.findUnique({
      where: { id },
      select: { id: true, nombre: true, activo: true },
    });
  }
}
