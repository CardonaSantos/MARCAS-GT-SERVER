import { DeliveryState } from '../../delivery.types';

export type DeliveryReadScope = Readonly<{
  empresaId: number;
  rol: string;
  vendedorId?: number;
  responsableId?: number;
}>;

export interface DeliveryQueryPort {
  list(filters: any & { scope: DeliveryReadScope }): Promise<any>;
  listCandidates(filters: any & { scope: DeliveryReadScope }): Promise<any>;
  get(id: number, scope: DeliveryReadScope): Promise<any | null>;
  listEvents(id: number, scope: DeliveryReadScope, filters: any): Promise<any>;
  listEvidence(id: number, scope: DeliveryReadScope): Promise<any[]>;
  getSummary(scope: DeliveryReadScope, filters?: any): Promise<any>;
  getOperationalReport(scope: DeliveryReadScope, filters?: any): Promise<any>;
}

export type DeliveryDirectoryEntry = Readonly<{
  id: number;
  estado: DeliveryState;
  empresaId: number;
  pedidoId: number;
  clienteId: number;
  ordenDespachoId: number;
  envioDespachoId: number | null;
  entregadoEn: Date | null;
  finalizadaEn: Date | null;
  detalles: ReadonlyArray<{
    id: number;
    pedidoDetalleId: number;
    productoId: number;
    cantidadEntregada: number;
    cantidadRechazada: number;
  }>;
}>;

export interface DeliveryDirectoryPort {
  findById(id: number): Promise<DeliveryDirectoryEntry | null>;
  findBillableById(id: number): Promise<DeliveryDirectoryEntry | null>;
}
