import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { FiscalItemType } from '../../billing.types';
import { BillingProductDirectoryPort } from '../../application/ports/billing-product-directory.port';

@Injectable()
export class BillingProductDirectoryPrismaAdapter implements BillingProductDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByIds(ids: readonly number[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.producto.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        codigoProducto: true,
        nombre: true,
        descripcion: true,
        perfilFiscal: {
          select: {
            activo: true,
            bienOServicio: true,
            unidadMedida: true,
            descripcionFiscal: true,
            nombreCortoImpuesto: true,
            codigoUnidadGravable: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      codigo: row.codigoProducto,
      nombre: row.nombre,
      descripcion: row.descripcion,
      fiscal: row.perfilFiscal
        ? {
            ...row.perfilFiscal,
            bienOServicio: row.perfilFiscal.bienOServicio as FiscalItemType,
          }
        : null,
    }));
  }
}
