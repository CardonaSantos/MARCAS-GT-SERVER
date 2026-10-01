import {
  DriverState,
  ShipmentIncidentState,
  ShipmentMode,
  ShipmentState,
  VehicleState,
} from '../../transport.types';
export type TransportReadScope = Readonly<{
  empresaId: number;
  rol: string;
  vendedorId?: number;
  responsableId?: number;
}>;

export type ShipmentCandidateFilters = Readonly<{
  page: number;
  limit: number;

  search?: string;

  bodegaId?: number;
  clienteId?: number;
  vendedorId?: number;

  scope: TransportReadScope;
}>;

export type ShipmentListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: ShipmentState;
  modalidad?: ShipmentMode;
  bodegaId?: number;
  transportistaId?: number;
  vehiculoId?: number;
  conductorId?: number;
  responsableId?: number;
  clienteId?: number;
  conIncidencia?: boolean;
  soloAtrasados?: boolean;
  fechaDesde?: Date;
  fechaHasta?: Date;
  sortBy: 'creadoEn' | 'numero' | 'estado' | 'salidaProgramadaEn' | 'salidaEn';
  sortDir: 'asc' | 'desc';
  scope: TransportReadScope;
}>;
export interface TransportQueryPort {
  getShipmentState(
    id: number,
    scope: TransportReadScope,
  ): Promise<{
    id: number;
    estado: ShipmentState;
    modalidad: ShipmentMode;
    version: number;
    bodegaId: number | null;
    vehiculoId: number | null;
    conductorId: number | null;
    responsableId: number | null;
  } | null>;
  listShipments(filters: ShipmentListFilters): Promise<any>;
  getShipment(id: number, scope: TransportReadScope): Promise<any | null>;
  listCandidates(filters: any): Promise<any>;
  listEvents(
    id: number,
    scope: TransportReadScope,
    page: number,
    limit: number,
  ): Promise<any>;
  listIncidents(
    id: number,
    scope: TransportReadScope,
    page: number,
    limit: number,
    estado?: ShipmentIncidentState,
  ): Promise<any>;
  getSummary(scope: TransportReadScope, filters?: any): Promise<any>;
  getOperationalReport(scope: TransportReadScope, filters?: any): Promise<any>;
  listCarriers(scope: TransportReadScope, filters: any): Promise<any[]>;
  listVehicles(
    scope: TransportReadScope,
    filters: { search?: string; activo?: boolean; estado?: VehicleState },
  ): Promise<any[]>;
  listDrivers(
    scope: TransportReadScope,
    filters: { search?: string; activo?: boolean; estado?: DriverState },
  ): Promise<any[]>;
}
