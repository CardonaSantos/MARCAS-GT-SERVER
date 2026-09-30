import { OrderPaymentCondition, OrderPaymentState, OrderState } from '../../order.types';

export type OrderDirectoryEntry = Readonly<{
  id: number;
  numero: string | null;
  empresaId: number;
  clienteId: number;
  vendedorId: number;
  estado: OrderState;
  condicionPago: OrderPaymentCondition;
  estadoPago: OrderPaymentState;
  total: string;
  confirmadoEn: Date | null;
  canceladoEn: Date | null;
  detalles: ReadonlyArray<{
    id: number;
    productoId: number;
    cantidadSolicitada: number;
    cantidadReservada: number;
    cantidadDespachada: number;
    cantidadEntregada: number;
  }>;
}>;

export interface OrderDirectoryPort {
  findById(id: number): Promise<OrderDirectoryEntry | null>;
}
