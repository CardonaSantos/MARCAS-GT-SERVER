export type CreateDeliveryCommand = Readonly<{
  envioDespachoId: number;
  claveIdempotencia: string;
  actorId: number;
}>;

export type StartDeliveryCommand = Readonly<{
  id: number;
  claveIdempotencia: string;
  latitud?: number | null;
  longitud?: number | null;
  actorId: number;
}>;

export type UpdateDeliveryResultCommand = Readonly<{
  id: number;
  receptorNombre?: string | null;
  receptorDocumento?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  observaciones?: string | null;
  detalles: readonly {
    detalleId: number;
    cantidadEntregada: number;
    cantidadRechazada: number;
    motivoRechazo?: string | null;
  }[];
  actorId: number;
}>;

export type FinalizeDeliveryCommand = Readonly<{
  id: number;
  resultado: 'ENTREGADA' | 'PARCIAL' | 'RECHAZADA' | 'NO_ENTREGADA';
  receptorNombre?: string | null;
  receptorDocumento?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  motivoNoEntrega?: any;
  detalleNoEntrega?: string | null;
  observaciones?: string | null;
  claveIdempotencia: string;
  actorId: number;
}>;
