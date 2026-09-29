import { Prisma } from '@prisma/client';
import { Pedido } from '../../../domain/entities/order.entity';
import { OrderPaymentCondition, OrderPaymentState, OrderState } from '../../../order.types';

export const ORDER_WITH_DETAILS = {
  detalles: { orderBy: { id: 'asc' as const } },
} satisfies Prisma.PedidoInclude;

export type OrderPersistenceRow = Prisma.PedidoGetPayload<{
  include: typeof ORDER_WITH_DETAILS;
}>;

export class OrderPrismaMapper {
  static toDomain(row: OrderPersistenceRow): Pedido {
    return Pedido.rehydrate({
      id: row.id,
      numero: row.numero,
      empresaId: row.empresaId,
      clienteId: row.clienteId,
      vendedorId: row.vendedorId,
      visitaId: row.visitaId,
      estado: row.estado as OrderState,
      condicionPago: row.condicionPago as OrderPaymentCondition,
      estadoPago: row.estadoPago as OrderPaymentState,
      moneda: row.moneda,
      subtotal: row.subtotal.toFixed(2),
      descuentoTotal: row.descuentoTotal.toFixed(2),
      total: row.total.toFixed(2),
      observaciones: row.observaciones,
      validacionSolicitadaEn: row.validacionSolicitadaEn,
      confirmadoEn: row.confirmadoEn,
      motivoCancelacion: row.motivoCancelacion,
      canceladoEn: row.canceladoEn,
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
      detalles: row.detalles.map((detail) => ({
        id: detail.id,
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        cantidadReservada: detail.cantidadReservada,
        cantidadDespachada: detail.cantidadDespachada,
        cantidadEntregada: detail.cantidadEntregada,
        precioUnitario: detail.precioUnitario.toFixed(2),
        descuento: detail.descuento.toFixed(2),
        subtotal: detail.subtotal.toFixed(2),
        observaciones: detail.observaciones,
        version: detail.version,
        creadoEn: detail.creadoEn,
        actualizadoEn: detail.actualizadoEn,
      })),
    });
  }
}
