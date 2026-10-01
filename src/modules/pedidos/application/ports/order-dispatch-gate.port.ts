export type OrderDispatchGateResult = Readonly<{
  repeated: boolean;
  pedidoId: number;
  estado: string;
}>;

export interface OrderDispatchGatePort {
  startPreparation(command: {
    pedidoId: number;
    ordenDespachoId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderDispatchGateResult>;

  registerDispatch(command: {
    pedidoId: number;
    pedidoDetalleId: number;
    cantidad: number;
    movimientoInventarioId: number;
    operacionDespachoDetalleId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderDispatchGateResult>;

  releasePreparation(command: {
    pedidoId: number;
    ordenDespachoId: number;
    operacionDespachoId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderDispatchGateResult>;
}
