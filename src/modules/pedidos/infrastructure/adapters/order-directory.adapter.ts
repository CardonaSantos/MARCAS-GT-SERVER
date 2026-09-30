import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { OrderDirectoryPort } from '../../application/ports/order-directory.port';
import { OrderPaymentCondition, OrderPaymentState, OrderState } from '../../order.types';

@Injectable()
export class OrderDirectoryAdapter implements OrderDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const row = await this.prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        empresaId: true,
        clienteId: true,
        vendedorId: true,
        estado: true,
        condicionPago: true,
        estadoPago: true,
        total: true,
        confirmadoEn: true,
        canceladoEn: true,
        detalles: {
          select: {
            id: true,
            productoId: true,
            cantidadSolicitada: true,
            cantidadReservada: true,
            cantidadDespachada: true,
            cantidadEntregada: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...row,
      estado: row.estado as OrderState,
      condicionPago: row.condicionPago as OrderPaymentCondition,
      estadoPago: row.estadoPago as OrderPaymentState,
      total: row.total.toFixed(2),
    };
  }
}
