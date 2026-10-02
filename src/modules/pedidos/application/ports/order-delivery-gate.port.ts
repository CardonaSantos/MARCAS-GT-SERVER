export type OrderDeliveryGateResult = Readonly<{
  repeated: boolean;
  pedidoId: number;
  estado: string;
}>;

export interface OrderDeliveryGatePort {
  registerDelivery(command: {
    pedidoId: number;
    entregaId: number;
    actorId: number;
    empresaId: number;
    resultado: 'ENTREGADA' | 'PARCIAL' | 'RECHAZADA' | 'NO_ENTREGADA';
    detalles: readonly {
      entregaDetalleId: number;
      pedidoDetalleId: number;
      cantidadEntregada: number;
    }[];
  }): Promise<OrderDeliveryGateResult>;
}
