import {
  BillingCandidateFilters,
  BillingPageMeta,
  BillingRangeFilters,
  BillingReadScope,
  InvoiceListFilters,
} from '../models/billing.models';

export type BillingPage<T> = Readonly<{
  data: readonly T[];
  meta: BillingPageMeta;
}>;

export interface BillingQueryPort {
  list(filters: InvoiceListFilters): Promise<BillingPage<Record<string, unknown>>>;
  listCandidates(filters: BillingCandidateFilters): Promise<BillingPage<Record<string, unknown>>>;
  getById(id: number, scope: BillingReadScope): Promise<Record<string, unknown> | null>;
  listEvents(id: number, scope: BillingReadScope, page: number, limit: number): Promise<BillingPage<Record<string, unknown>>>;
  listFelOperations(id: number, scope: BillingReadScope, page: number, limit: number): Promise<BillingPage<Record<string, unknown>>>;
  getSummary(filters: BillingRangeFilters): Promise<Record<string, unknown>>;
  getOperationalReport(filters: BillingRangeFilters): Promise<Record<string, unknown>>;
  listReceivables(filters: {
    page: number;
    limit: number;
    search?: string;
    estado?: string;
    clienteId?: number;
    soloVencidas?: boolean;
    scope: BillingReadScope;
  }): Promise<BillingPage<Record<string, unknown>>>;
  getReceivableSummary(filters: BillingRangeFilters): Promise<Record<string, unknown>>;
}

export interface BillingDirectoryPort {
  findById(id: number): Promise<Readonly<{
    id: number;
    empresaId: number;
    clienteId: number;
    pedidoId: number | null;
    estado: string;
    total: string;
    documentoFiscalId: number | null;
    cuentaPorCobrarId: number | null;
  }> | null>;
}

export interface ReceivableDirectoryPort {
  findById(id: number): Promise<Readonly<{
    id: number;
    empresaId: number;
    clienteId: number;
    facturaId: number | null;
    estado: string;
    montoOriginal: string;
    saldoPendiente: string;
    fechaVencimiento: Date;
    version: number;
  }> | null>;
}
