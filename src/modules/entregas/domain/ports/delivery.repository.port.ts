import {
  DeliveryAuditDraft,
  DeliveryFailureReason,
  DeliveryState,
} from '../../delivery.types';

export type DeliveryWriteModel = Readonly<{
  id: number;
  estado: DeliveryState;
  pedidoId: number;
  clienteId: number;
  ordenDespachoId: number;
  envioDespachoId: number | null;
  version: number;
  registradoPorId: number | null;
  receptorNombre: string | null;
  receptorDocumento: string | null;
  latitud: number | null;
  longitud: number | null;
  motivoNoEntrega: DeliveryFailureReason | null;
  detalleNoEntrega: string | null;
  detalles: ReadonlyArray<{
    id: number;
    ordenDespachoDetalleId: number;
    pedidoDetalleId: number;
    productoId: number;
    cantidadEntregada: number;
    cantidadRechazada: number;
    motivoRechazo: string | null;
    version: number;
  }>;
  evidencias: ReadonlyArray<{
    id: number;
    tipo: string;
    url: string;
    key: string | null;
  }>;
}>;

export interface DeliveryRepositoryPort {
  findById(id: number): Promise<DeliveryWriteModel | null>;
  findByStopId(envioDespachoId: number): Promise<DeliveryWriteModel | null>;
  findByIdempotencyKey(key: string): Promise<DeliveryWriteModel | null>;

  create(input: {
    ordenDespachoId: number;
    pedidoId: number;
    clienteId: number;
    envioDespachoId: number;
    registradoPorId: number;
    claveIdempotencia: string;
    detalles: readonly {
      ordenDespachoDetalleId: number;
      pedidoDetalleId: number;
      productoId: number;
    }[];
    audit: DeliveryAuditDraft;
  }): Promise<DeliveryWriteModel>;

  start(input: {
    id: number;
    actorId: number;
    expectedVersion: number;
    latitud?: number | null;
    longitud?: number | null;
    claveIdempotencia: string;
  }): Promise<void>;

  updateResult(input: {
    id: number;
    expectedVersion: number;
    receptorNombre?: string | null;
    receptorDocumento?: string | null;
    latitud?: number | null;
    longitud?: number | null;
    observaciones?: string | null;
    detalles: readonly {
      id: number;
      cantidadEntregada: number;
      cantidadRechazada: number;
      motivoRechazo?: string | null;
    }[];
  }): Promise<void>;

  addEvidence(input: {
    entregaId: number;
    tipo: string;
    url: string;
    key?: string | null;
    mimeType?: string | null;
    size?: number | null;
    descripcion?: string | null;
    claveIdempotencia: string;
    actorId: number;
  }): Promise<{ id: number }>;

  removeEvidence(input: {
    entregaId: number;
    evidenciaId: number;
  }): Promise<{ key: string | null } | null>;

  finalize(input: {
    id: number;
    actorId: number;
    expectedVersion: number;
    resultado: 'ENTREGADA' | 'PARCIAL' | 'RECHAZADA' | 'NO_ENTREGADA';
    receptorNombre?: string | null;
    receptorDocumento?: string | null;
    latitud?: number | null;
    longitud?: number | null;
    motivoNoEntrega?: DeliveryFailureReason | null;
    detalleNoEntrega?: string | null;
    observaciones?: string | null;
    claveIdempotencia: string;
  }): Promise<void>;

  addObservation(input: {
    id: number;
    actorId: number;
    detalle: string;
    claveIdempotencia: string;
  }): Promise<void>;
}
