import { PaymentReadScope } from '../../payment.types';

export type PaymentPage<T> = Readonly<{
  data: readonly T[];
  meta: Readonly<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>;
}>;

export interface PaymentQueryPort {
  list(filters: {
    page: number;
    limit: number;
    search?: string;
    estado?: string;
    metodo?: string;
    clienteId?: number;
    pedidoId?: number;
    bancoId?: number;
    fechaDesde?: Date;
    fechaHasta?: Date;
    soloConSaldoDisponible?: boolean;
    scope: PaymentReadScope;
  }): Promise<PaymentPage<Record<string, unknown>>>;

  getById(
    id: number,
    scope: PaymentReadScope,
  ): Promise<Record<string, unknown> | null>;

  listEvents(
    id: number,
    scope: PaymentReadScope,
    page: number,
    limit: number,
  ): Promise<PaymentPage<Record<string, unknown>>>;

  listApplications(
    id: number,
    scope: PaymentReadScope,
    page: number,
    limit: number,
  ): Promise<PaymentPage<Record<string, unknown>>>;

  listReceivableCandidates(
    id: number,
    scope: PaymentReadScope,
    page: number,
    limit: number,
  ): Promise<PaymentPage<Record<string, unknown>>>;

  getSummary(filters: {
    fechaDesde?: Date;
    fechaHasta?: Date;
    scope: PaymentReadScope;
  }): Promise<Record<string, unknown>>;
}

export interface PaymentDirectoryPort {
  findById(id: number): Promise<Readonly<{
    id: number;
    empresaId: number;
    clienteId: number;
    pedidoId: number | null;
    estado: string;
    moneda: string;
    monto: string;
    montoAplicado: string;
    montoDisponible: string;
  }> | null>;
}
