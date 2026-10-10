import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  OrderPaymentCondition,
  OrderPaymentState,
  OrderState,
} from '../../order.types';
import {
  OrderBillingDirectoryPort,
  OrderBillingEntry,
} from '../../application/ports/order-billing-directory.port';

@Injectable()
export class OrderBillingDirectoryAdapter implements OrderBillingDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findForBilling(pedidoId: number): Promise<OrderBillingEntry | null> {
    const row = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        numero: true,
        empresaId: true,
        clienteId: true,
        vendedorId: true,
        estado: true,
        condicionPago: true,
        estadoPago: true,
        moneda: true,
        subtotal: true,
        descuentoTotal: true,
        total: true,
        detalles: {
          select: {
            id: true,
            productoId: true,
            cantidadSolicitada: true,
            cantidadDespachada: true,
            cantidadEntregada: true,
            precioUnitario: true,
            descuento: true,
            subtotal: true,
          },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      numero: row.numero,
      empresaId: row.empresaId,
      clienteId: row.clienteId,
      vendedorId: row.vendedorId,
      estado: row.estado as OrderState,
      condicionPago: row.condicionPago as OrderPaymentCondition,
      estadoPago: row.estadoPago as OrderPaymentState,
      moneda: row.moneda,
      subtotal: row.subtotal.toFixed(2),
      descuentoTotal: row.descuentoTotal.toFixed(2),
      total: row.total.toFixed(2),
      detalles: row.detalles.map((detail) => ({
        id: detail.id,
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        cantidadDespachada: detail.cantidadDespachada,
        cantidadEntregada: detail.cantidadEntregada,
        precioUnitario: detail.precioUnitario.toFixed(2),
        descuento: detail.descuento.toFixed(2),
        subtotal: detail.subtotal.toFixed(2),
      })),
    };
  }
}
