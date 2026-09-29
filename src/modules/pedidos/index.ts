export { PedidosModule } from './orders.module';
export { ORDER_DIRECTORY } from './order.tokens';
export type {
  OrderDirectoryEntry,
  OrderDirectoryPort,
} from './application/ports/order-directory.port';
// export  OrderCreditGatePort

export { OrderCreditGatePort } from 'src/modules/pedidos/application/ports/order-credit-gate.port';
