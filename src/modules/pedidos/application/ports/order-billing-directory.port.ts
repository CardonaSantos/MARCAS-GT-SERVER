import {
  OrderPaymentCondition,
  OrderPaymentState,
  OrderState,
} from '../../order.types';

export type OrderBillingEntry = Readonly<{
  id: number;
  numero: string | null;
  empresaId: number;
  clienteId: number;
  vendedorId: number;
  estado: OrderState;
  condicionPago: OrderPaymentCondition;
  estadoPago: OrderPaymentState;
  moneda: string;
  subtotal: string;
  descuentoTotal: string;
  total: string;
  detalles: ReadonlyArray<{
    id: number;
    productoId: number;
    cantidadSolicitada: number;
    cantidadDespachada: number;
    cantidadEntregada: number;
    precioUnitario: string;
    descuento: string;
    subtotal: string;
  }>;
}>;

export interface OrderBillingDirectoryPort {
  findForBilling(pedidoId: number): Promise<OrderBillingEntry | null>;
}
