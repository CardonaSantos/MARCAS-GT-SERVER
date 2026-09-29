export { PedidosModule } from './orders.module';
export { ORDER_CREDIT_GATE, ORDER_DIRECTORY } from './order.tokens';
export type {
  OrderDirectoryEntry,
  OrderDirectoryPort,
} from './application/ports/order-directory.port';
export type {
  OrderCreditGatePort,
  OrderCreditGateResult,
} from './application/ports/order-credit-gate.port';
