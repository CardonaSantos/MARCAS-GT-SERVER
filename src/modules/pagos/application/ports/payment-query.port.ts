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

export type PaymentBankOption = Readonly<{
  id: number;
  nombre: string;
  codigo: string | null;
}>;

export type PaymentBankAdminView = Readonly<{
  id: number;
  nombre: string;
  codigo: string | null;
  cuenta: string | null;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export interface PaymentQueryPort {
  listBanks(scope: PaymentReadScope): Promise<readonly PaymentBankOption[]>;
  listBanksAdmin(
    scope: PaymentReadScope,
  ): Promise<readonly PaymentBankAdminView[]>;

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
