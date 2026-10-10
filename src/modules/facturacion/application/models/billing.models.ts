import {
  FiscalEnvironment,
  FiscalItemType,
  InvoiceState,
} from '../../billing.types';

export type CreateInvoiceCommand = Readonly<{
  entregaIds: readonly number[];
  lineas: readonly {
    entregaDetalleId: number;
    cantidad: number;
  }[];
  claveIdempotencia: string;
  actorId: number;
}>;

export type DiscardInvoiceCommand = Readonly<{
  id: number;
  motivo: string;
  claveIdempotencia: string;
  actorId: number;
}>;

export type PrepareInvoiceCommand = Readonly<{
  id: number;
  tipoDte: string;
  entorno: FiscalEnvironment;
  establecimientoId?: number;
  serieInterna?: string;
  versionEsquema?: string;
  actorId: number;
}>;

export type BillingReadScope = Readonly<{
  empresaId: number;
  rol: string;
  vendedorId?: number;
}>;

export type BillingPageMeta = Readonly<{
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}>;

export type InvoiceListFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  estado?: InvoiceState;
  estadoFiscal?: string;
  clienteId?: number;
  pedidoId?: number;
  vendedorId?: number;
  condicionPago?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
  soloPendientesFel?: boolean;
  soloErroresFel?: boolean;
  soloInciertas?: boolean;
  sortBy: 'creadoEn' | 'actualizadoEn' | 'estado' | 'total' | 'emitidaEn';
  sortDir: 'asc' | 'desc';
  scope: BillingReadScope;
}>;

export type BillingCandidateFilters = Readonly<{
  page: number;
  limit: number;
  search?: string;
  clienteId?: number;
  pedidoId?: number;
  scope: BillingReadScope;
}>;

export type BillingRangeFilters = Readonly<{
  fechaDesde?: Date;
  fechaHasta?: Date;
  scope: BillingReadScope;
}>;

export type BillingWarning = Readonly<{
  codigo: string;
  nivel: 'INFO' | 'ADVERTENCIA' | 'CRITICO';
  mensaje: string;
}>;

export type FiscalLineDraft = Readonly<{
  facturaDetalleId: number;
  productoId: number;
  descripcion: string;
  bienOServicio: FiscalItemType;
  unidadMedida: string;
  totalLinea: string;
}>;
