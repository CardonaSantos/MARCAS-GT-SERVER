import { PageResult, SortDirection } from 'src/shared/application/pagination/page.models';
import {
  InventoryMovementType,
  InventoryReference,
  InventoryReservationState,
  InventoryUserRole,
} from '../../domain/inventory.types';

export type InventorySortField =
  | 'producto'
  | 'codigoProducto'
  | 'bodega'
  | 'cantidadReal'
  | 'cantidadReservada'
  | 'cantidadDisponible'
  | 'costoPromedio'
  | 'actualizadoEn';

export type InventoryListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  bodegaId?: number;
  productoId?: number;
  conExistencia?: boolean;
  conReservas?: boolean;
  sortBy: InventorySortField;
  sortDir: SortDirection;
}>;

export type InventoryMovementFilters = Readonly<{
  page: number;
  limit: number;
  bodegaId?: number;
  productoId?: number;
  tipo?: InventoryMovementType;
  referenciaTipo?: string;
  referenciaId?: number;
  creadoPorId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
}>;

export type InventoryReservationFilters = Readonly<{
  page: number;
  limit: number;
  bodegaId?: number;
  productoId?: number;
  pedidoDetalleId?: number;
  estado?: InventoryReservationState;
}>;

export type InventoryProductView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
}>;

export type InventoryBodegaView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  esPrincipal: boolean;
}>;

export type InventoryActorView = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: InventoryUserRole;
  activo: boolean;
}>;

export type InventoryStockListItemView = Readonly<{
  id: number;
  producto: InventoryProductView;
  bodega: InventoryBodegaView;
  cantidadReal: number;
  cantidadReservada: number;
  cantidadDisponible: number;
  costoPromedio: string;
  valorInventario: string;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type InventoryMovementView = Readonly<{
  id: number;
  tipo: InventoryMovementType;
  cantidad: number;
  costoUnitario: string | null;
  costoPromedioAntes: string;
  costoPromedioDespues: string;
  cantidadRealAntes: number;
  cantidadRealDespues: number;
  reservadaAntes: number;
  reservadaDespues: number;
  referencia: InventoryReference | null;
  claveIdempotencia: string | null;
  observaciones: string | null;
  actor: InventoryActorView | null;
  creadoEn: Date;
}>;

export type InventoryReservationView = Readonly<{
  id: number;
  pedidoDetalleId: number;
  pedidoId: number;
  producto: InventoryProductView;
  bodega: InventoryBodegaView;
  cantidadOriginal: number;
  cantidadPendiente: number;
  cantidadAplicada: number;
  cantidadLiberada: number;
  estado: InventoryReservationState;
  aplicadaEn: Date | null;
  liberadaEn: Date | null;
  cerradaEn: Date | null;
  canceladaEn: Date | null;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type InventoryStockDetailView = InventoryStockListItemView & Readonly<{
  reservasActivas: InventoryReservationView[];
  ultimosMovimientos: InventoryMovementView[];
}>;

export type ProductAvailabilityView = Readonly<{
  producto: InventoryProductView;
  totales: {
    real: number;
    reservado: number;
    disponible: number;
  };
  bodegas: Array<{
    stockId: number;
    bodegaId: number;
    codigo: string;
    nombre: string;
    esPrincipal: boolean;
    real: number;
    reservado: number;
    disponible: number;
  }>;
}>;

export type InventorySummaryView = Readonly<{
  totalRegistros: number;
  productosConExistencia: number;
  productosAgotados: number;
  cantidadRealTotal: number;
  cantidadReservadaTotal: number;
  cantidadDisponibleTotal: number;
  valorInventario: string;
}>;

export type InventoryMutationResult = Readonly<{
  repeated: boolean;
  stockId: number;
  movimientoId: number;
  reservaId?: number | null;
  snapshot: {
    cantidadReal: number;
    cantidadReservada: number;
    cantidadDisponible: number;
    costoPromedio: string;
  };
}>;

export type RegisterEntryCommand = Readonly<{
  bodegaId: number;
  productoId: number;
  cantidad: number;
  costoUnitario: string;
  proveedorId?: number | null;
  reference?: InventoryReference | null;
  observaciones?: string | null;
  claveIdempotencia?: string | null;
  actorId: number;
}>;

export type AdjustInventoryCommand = Readonly<{
  bodegaId: number;
  productoId: number;
  tipo: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  costoUnitario?: string | null;
  motivo: string;
  claveIdempotencia?: string | null;
  actorId: number;
}>;

export type ReserveInventoryCommand = Readonly<{
  pedidoDetalleId: number;
  bodegaId: number;
  cantidad: number;
  claveIdempotencia?: string | null;
  actorId: number;
}>;

export type ReservationMutationCommand = Readonly<{
  reservaId: number;
  cantidad: number;
  reference?: InventoryReference | null;
  observaciones?: string | null;
  claveIdempotencia?: string | null;
  actorId: number;
}>;

export type CancelReservationCommand = Readonly<{
  reservaId: number;
  motivo: string;
  reference?: InventoryReference | null;
  claveIdempotencia?: string | null;
  actorId: number;
}>;

export type RegisterReturnCommand = Readonly<{
  bodegaId: number;
  productoId: number;
  cantidad: number;
  costoUnitario?: string | null;
  reference?: InventoryReference | null;
  observaciones?: string | null;
  claveIdempotencia?: string | null;
  actorId: number;
}>;

export type RegisterTransferCommand = Readonly<{
  bodegaId: number;
  productoId: number;
  cantidad: number;
  costoUnitario?: string | null;
  transferenciaId: number;
  observaciones?: string | null;
  claveIdempotencia: string;
  actorId: number;
}>;

export type InventoryPage = PageResult<InventoryStockListItemView>;
export type InventoryMovementPage = PageResult<InventoryMovementView>;
export type InventoryReservationPage = PageResult<InventoryReservationView>;
