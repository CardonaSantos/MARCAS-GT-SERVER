import {
  ShipmentIncidentSeverity,
  ShipmentIncidentType,
  ShipmentMode,
} from '../../transport.types';
export type CreateShipmentPersistenceInput = Readonly<{
  empresaId: number;
  bodegaId: number;
  modalidad: ShipmentMode;
  creadoPorId: number;
  salidaProgramadaEn?: Date | null;
  entregaEstimadaEn?: Date | null;
  guia?: string | null;
  costo?: number | null;
  trackingUrl?: string | null;
  comprobanteUrl?: string | null;
  observaciones?: string | null;
  paradas: ReadonlyArray<{
    ordenDespachoId: number;
    clienteId: number;
    secuencia: number;
    destinatario: string;
    telefonoDestino?: string | null;
    direccionDestino: string;
    latitudDestino?: number | null;
    longitudDestino?: number | null;
    cargas: ReadonlyArray<{
      ordenDespachoDetalleId: number;
      productoId: number;
      cantidadPlanificada: number;
    }>;
  }>;
}>;
export interface TransportWorkflowPort {
  createShipment(
    input: CreateShipmentPersistenceInput,
  ): Promise<{ id: number; numero: string }>;
  assignResources(input: {
    shipmentId: number;
    expectedVersion: number;
    actorId: number;
    modalidad: ShipmentMode;
    transportistaId?: number | null;
    vehiculoId?: number | null;
    conductorId?: number | null;
    responsableId?: number | null;
    claveIdempotencia: string;
  }): Promise<void>;
  confirmLoad(input: {
    shipmentId: number;
    expectedVersion: number;
    actorId: number;
    claveIdempotencia: string;
    lineas: ReadonlyArray<{ cargaDetalleId: number; cantidadCargada: number }>;
  }): Promise<void>;
  startRoute(input: {
    shipmentId: number;
    expectedVersion: number;
    actorId: number;
    claveIdempotencia: string;
    latitud?: number | null;
    longitud?: number | null;
  }): Promise<void>;
  cancelShipment(input: {
    shipmentId: number;
    expectedVersion: number;
    actorId: number;
    motivo: string;
    claveIdempotencia: string;
  }): Promise<void>;
  addObservation(input: {
    shipmentId: number;
    actorId: number;
    detalle: string;
    claveIdempotencia?: string | null;
  }): Promise<void>;
  reportIncident(input: {
    shipmentId: number;
    actorId: number;
    tipo: ShipmentIncidentType;
    severidad: ShipmentIncidentSeverity;
    descripcion: string;
    latitud?: number | null;
    longitud?: number | null;
    claveIdempotencia: string;
  }): Promise<{ id: number }>;
  resolveIncident(input: {
    shipmentId: number;
    incidentId: number;
    actorId: number;
    resolucion: string;
    claveIdempotencia: string;
  }): Promise<void>;
}
