import {
  PageResult,
  SortDirection,
} from 'src/shared/application/pagination/page.models';
import {
  TransferEventType,
  TransferOperationState,
  TransferOperationType,
  TransferState,
} from '../../transfer.types';

export type TransferSortField =
  | 'creadoEn'
  | 'actualizadoEn'
  | 'estado'
  | 'bodegaOrigen'
  | 'bodegaDestino'
  | 'creadoPor';

export type TransferListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: TransferState;
  bodegaOrigenId?: number;
  bodegaDestinoId?: number;
  creadoPorId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  soloPendientes?: boolean;
  sortBy: TransferSortField;
  sortDir: SortDirection;
}>;

export type TransferOperationFilters = Readonly<{
  page: number;
  limit: number;
  transferenciaId?: number;
  bodegaOrigenId?: number;
  bodegaDestinoId?: number;
  usuarioId?: number;
  tipo?: TransferOperationType;
  estado?: TransferOperationState;
  fechaDesde?: Date;
  fechaHasta?: Date;
}>;

export type TransferEventFilters = Readonly<{
  page: number;
  limit: number;
}>;

export type TransferSummaryFilters = Readonly<{
  bodegaOrigenId?: number;
  bodegaDestinoId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
}>;

export type TransferWarehouseView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
  esPrincipal: boolean;
}>;

export type TransferProductView = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
}>;

export type TransferUserView = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}>;

export type TransferProgressView = Readonly<{
  productos: number;
  unidadesSolicitadas: number;
  unidadesEnviadas: number;
  unidadesRecibidas: number;
  unidadesEnTransito: number;
  unidadesPendientesEnvio: number;
  porcentajeRecepcion: number;
}>;

export type TransferListItemView = Readonly<{
  id: number;
  estado: TransferState;
  bodegaOrigen: TransferWarehouseView;
  bodegaDestino: TransferWarehouseView;
  creadoPor: TransferUserView;
  progreso: TransferProgressView;
  observaciones: string | null;
  preparadaEn: Date | null;
  enviadaEn: Date | null;
  recibidaEn: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type TransferDetailLineView = Readonly<{
  id: number;
  producto: TransferProductView;
  cantidadSolicitada: number;
  cantidadEnviada: number;
  cantidadRecibida: number;
  cantidadEnTransito: number;
  cantidadPendienteEnvio: number;
  porcentajeRecepcion: number;
  observaciones: string | null;
  version: number;
}>;

export type TransferEventView = Readonly<{
  id: number;
  tipo: TransferEventType;
  detalle: string | null;
  actor: TransferUserView | null;
  creadoEn: Date;
}>;

export type TransferOperationLineView = Readonly<{
  id: number;
  transferenciaDetalleId: number;
  producto: TransferProductView;
  cantidad: number;
  costoUnitario: string | null;
  subtotal: string | null;
}>;

export type TransferOperationView = Readonly<{
  id: number;
  transferenciaId: number;
  tipo: TransferOperationType;
  estado: TransferOperationState;
  usuario: TransferUserView;
  claveIdempotencia: string;
  documentoReferencia: string | null;
  observaciones: string | null;
  ocurridaEn: Date;
  aplicadaEn: Date | null;
  errorAplicacion: string | null;
  version: number;
  detalles: TransferOperationLineView[];
  unidades: number;
  costoTotal: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type TransferActionsView = Readonly<{
  puedeEditar: boolean;
  puedePreparar: boolean;
  puedeEnviar: boolean;
  puedeRecibir: boolean;
  puedeCancelar: boolean;
}>;

export type TransferDetailView = TransferListItemView & Readonly<{
  version: number;
  motivoCancelacion: string | null;
  canceladaEn: Date | null;
  detalles: TransferDetailLineView[];
  operaciones: TransferOperationView[];
  eventos: TransferEventView[];
  acciones: TransferActionsView;
}>;

export type TransferSummaryView = Readonly<{
  total: number;
  borradores: number;
  preparadas: number;
  enTransito: number;
  recibidasParcial: number;
  recibidas: number;
  canceladas: number;
  abiertas: number;
  unidadesSolicitadas: number;
  unidadesEnviadas: number;
  unidadesRecibidas: number;
  unidadesEnTransito: number;
  valorEnTransito: string;
  operacionesPendientes: number;
  operacionesFallidas: number;
}>;

export type CreateTransferDetailCommand = Readonly<{
  productoId: number;
  cantidadSolicitada: number;
  observaciones?: string | null;
}>;

export type CreateTransferCommand = Readonly<{
  bodegaOrigenId: number;
  bodegaDestinoId: number;
  observaciones?: string | null;
  detalles?: CreateTransferDetailCommand[];
  actorId: number;
}>;

export type UpdateTransferCommand = Readonly<{
  id: number;
  bodegaOrigenId?: number;
  bodegaDestinoId?: number;
  observaciones?: string | null;
  detalles?: CreateTransferDetailCommand[];
  actorId: number;
}>;

export type TransferActionCommand = Readonly<{
  id: number;
  actorId: number;
}>;

export type TransferReasonCommand = Readonly<{
  id: number;
  motivo: string;
  actorId: number;
}>;

export type RegisterTransferOutboundCommand = Readonly<{
  transferenciaId: number;
  claveIdempotencia: string;
  documentoReferencia?: string | null;
  observaciones?: string | null;
  ocurridaEn?: Date | null;
  actorId: number;
}>;

export type RegisterTransferReceiptLineCommand = Readonly<{
  transferenciaDetalleId: number;
  cantidad: number;
}>;

export type RegisterTransferReceiptCommand = Readonly<{
  transferenciaId: number;
  claveIdempotencia: string;
  documentoReferencia?: string | null;
  observaciones?: string | null;
  ocurridaEn?: Date | null;
  detalles: RegisterTransferReceiptLineCommand[];
  actorId: number;
}>;

export type RegisterTransferOperationResult = Readonly<{
  repeated: boolean;
  operationId: number;
  transferenciaId: number;
  estadoOperacion: TransferOperationState;
  estadoTransferencia: TransferState;
}>;

export type TransferDirectoryEntry = Readonly<{
  id: number;
  estado: TransferState;
  bodegaOrigenId: number;
  bodegaDestinoId: number;
  enviadaEn: Date | null;
  recibidaEn: Date | null;
}>;

export type TransferPage = PageResult<TransferListItemView>;
export type TransferOperationPage = PageResult<TransferOperationView>;
export type TransferEventPage = PageResult<TransferEventView>;
