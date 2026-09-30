import { PageResult, SortDirection } from 'src/shared/application/pagination/page.models';
import { RequisitionReceiptState, RequisitionState } from '../../domain/requisition.types';

export type RequisitionSortField =
  | 'creadoEn'
  | 'actualizadoEn'
  | 'estado'
  | 'bodega'
  | 'proveedor'
  | 'solicitante';

export type RequisitionListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: RequisitionState;
  bodegaDestinoId?: number;
  proveedorId?: number;
  solicitanteId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  soloPendientesRecepcion?: boolean;
  sortBy: RequisitionSortField;
  sortDir: SortDirection;
}>;

export type ReceiptListFilters = Readonly<{
  page: number;
  limit: number;
  requisicionId?: number;
  bodegaDestinoId?: number;
  proveedorId?: number;
  recibidoPorId?: number;
  estado?: RequisitionReceiptState;
  fechaDesde?: Date;
  fechaHasta?: Date;
}>;

export type RequisitionEventFilters = Readonly<{
  page: number;
  limit: number;
}>;

export type RequisitionProductView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
}>;

export type RequisitionWarehouseView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  esPrincipal: boolean;
}>;

export type RequisitionProviderView = Readonly<{
  id: number;
  nombre: string;
  telefono: string | null;
  correo: string | null;
}>;

export type RequisitionUserView = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}>;

export type RequisitionProgressView = Readonly<{
  productos: number;
  unidadesSolicitadas: number;
  unidadesRecibidas: number;
  unidadesPendientes: number;
  porcentajeRecepcion: number;
  costoEstimado: string;
}>;

export type RequisitionListItemView = Readonly<{
  id: number;
  estado: RequisitionState;
  bodega: RequisitionWarehouseView;
  proveedor: RequisitionProviderView | null;
  solicitante: RequisitionUserView;
  progreso: RequisitionProgressView;
  observaciones: string | null;
  solicitadaEn: Date | null;
  aprobadaEn: Date | null;
  completadaEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type RequisitionDetailLineView = Readonly<{
  id: number;
  producto: RequisitionProductView;
  cantidadSolicitada: number;
  cantidadRecibida: number;
  cantidadPendiente: number;
  porcentajeRecepcion: number;
  costoUnitarioEstimado: string | null;
  subtotalEstimado: string | null;
  version: number;
}>;

export type RequisitionEventView = Readonly<{
  id: number;
  tipo: string;
  detalle: string | null;
  actor: RequisitionUserView | null;
  creadoEn: Date;
}>;

export type ReceiptLineView = Readonly<{
  id: number;
  requisicionDetalleId: number;
  producto: RequisitionProductView;
  cantidad: number;
  costoUnitario: string;
  subtotal: string;
}>;

export type ReceiptView = Readonly<{
  id: number;
  requisicionId: number;
  estado: RequisitionReceiptState;
  recibidoPor: RequisitionUserView;
  claveIdempotencia: string;
  documentoReferencia: string | null;
  observaciones: string | null;
  recibidoEn: Date;
  aplicadaEn: Date | null;
  errorAplicacion: string | null;
  detalles: ReceiptLineView[];
  unidades: number;
  costoTotal: string;
  creadoEn: Date;
}>;

export type RequisitionActionsView = Readonly<{
  puedeEditar: boolean;
  puedeSolicitar: boolean;
  puedeAprobar: boolean;
  puedeRechazar: boolean;
  puedeRecibir: boolean;
  puedeCancelar: boolean;
}>;

export type RequisitionDetailView = RequisitionListItemView & Readonly<{
  version: number;
  motivoRechazo: string | null;
  motivoCancelacion: string | null;
  rechazadaEn: Date | null;
  canceladaEn: Date | null;
  detalles: RequisitionDetailLineView[];
  recepciones: ReceiptView[];
  eventos: RequisitionEventView[];
  acciones: RequisitionActionsView;
}>;

export type RequisitionSummaryView = Readonly<{
  total: number;
  borradores: number;
  solicitadas: number;
  aprobadas: number;
  parciales: number;
  completadas: number;
  rechazadas: number;
  canceladas: number;
  abiertas: number;
  unidadesSolicitadas: number;
  unidadesRecibidas: number;
  unidadesPendientes: number;
  costoEstimadoTotal: string;
  recepcionesPendientes: number;
  recepcionesFallidas: number;
}>;

export type CreateRequisitionDetailCommand = Readonly<{
  productoId: number;
  cantidadSolicitada: number;
  costoUnitarioEstimado?: string | null;
}>;

export type CreateRequisitionCommand = Readonly<{
  bodegaDestinoId: number;
  proveedorId?: number | null;
  observaciones?: string | null;
  detalles?: CreateRequisitionDetailCommand[];
  actorId: number;
}>;

export type UpdateRequisitionCommand = Readonly<{
  id: number;
  bodegaDestinoId?: number;
  proveedorId?: number | null;
  observaciones?: string | null;
  detalles?: CreateRequisitionDetailCommand[];
  actorId: number;
}>;

export type RequisitionActionCommand = Readonly<{ id: number; actorId: number }>;
export type RequisitionReasonCommand = Readonly<{ id: number; motivo: string; actorId: number }>;

export type RegisterReceiptLineCommand = Readonly<{
  requisicionDetalleId: number;
  cantidad: number;
  costoUnitario: string;
}>;

export type RegisterReceiptCommand = Readonly<{
  requisicionId: number;
  claveIdempotencia: string;
  documentoReferencia?: string | null;
  observaciones?: string | null;
  recibidoEn?: Date | null;
  detalles: RegisterReceiptLineCommand[];
  actorId: number;
}>;

export type RegisterReceiptResult = Readonly<{
  repeated: boolean;
  receiptId: number;
  requisicionId: number;
  estado: RequisitionReceiptState;
}>;

export type RequisitionDirectoryEntry = Readonly<{
  id: number;
  estado: RequisitionState;
  bodegaDestinoId: number;
  proveedorId: number | null;
}>;

export type RequisitionPage = PageResult<RequisitionListItemView>;
export type ReceiptPage = PageResult<ReceiptView>;
export type RequisitionEventPage = PageResult<RequisitionEventView>;
