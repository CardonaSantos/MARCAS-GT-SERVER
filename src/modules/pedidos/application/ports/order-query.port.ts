import {
  OrderDetailView,
  OrderEventFilters,
  OrderEventPage,
  OrderListFilters,
  OrderPage,
  OrderSummaryFilters,
  OrderSummaryView,
} from '../models/order.models';

export interface OrderQueryPort {
  list(filters: OrderListFilters): Promise<OrderPage>;
  getById(
    id: number,
    scope: { empresaId: number; vendedorId?: number },
  ): Promise<OrderDetailView | null>;
  listEvents(pedidoId: number, filters: OrderEventFilters): Promise<OrderEventPage>;
  getSummary(filters: OrderSummaryFilters): Promise<OrderSummaryView>;
}
