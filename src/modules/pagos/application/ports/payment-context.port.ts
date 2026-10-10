export type PaymentOrderContext = Readonly<{
  id: number;
  empresaId: number;
  clienteId: number;
  vendedorId: number;
  estado: string;
  condicionPago: string;
  estadoPago: string;
  moneda: string;
  total: string;
}>;

export type PaymentBankContext = Readonly<{
  id: number;
  empresaId: number;
  nombre: string;
  activo: boolean;
}>;

export interface PaymentContextPort {
  customerExists(clienteId: number): Promise<boolean>;
  findOrder(pedidoId: number): Promise<PaymentOrderContext | null>;
  findBank(bancoId: number): Promise<PaymentBankContext | null>;
}
