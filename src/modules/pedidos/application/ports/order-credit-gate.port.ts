export type OrderCreditGateResult = Readonly<{
  repeated: boolean;
  pedidoId: number;
  estado: string;
}>;

export interface OrderCreditGatePort {
  confirmApprovedCredit(command: {
    pedidoId: number;
    solicitudCreditoId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderCreditGateResult>;

  registerCreditRejection(command: {
    pedidoId: number;
    solicitudCreditoId: number;
    actorId: number;
    empresaId: number;
    motivo: string;
  }): Promise<OrderCreditGateResult>;
}
