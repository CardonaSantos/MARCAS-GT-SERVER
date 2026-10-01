export interface TransportDeliveryGatePort {
  markStopResult(input: {
    envioDespachoId: number;
    actorId: number;
    resultado: 'ENTREGADA' | 'PARCIAL' | 'NO_ENTREGADA' | 'RECHAZADA';
    detalle?: string | null;
    claveIdempotencia: string;
  }): Promise<void>;
}
