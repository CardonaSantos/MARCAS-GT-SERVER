export { PedidosModule } from './orders.module';
export {
  ORDER_CREDIT_GATE,
  ORDER_DIRECTORY,
  ORDER_DISPATCH_GATE,
} from './order.tokens';

export type {
  OrderDirectoryEntry,
  OrderDirectoryPort,
} from './application/ports/order-directory.port';

export type {
  OrderCreditGatePort,
  OrderCreditGateResult,
} from './application/ports/order-credit-gate.port';

export type {
  OrderDispatchGatePort,
  OrderDispatchGateResult,
} from './application/ports/order-dispatch-gate.port';
