export type PaymentBankSnapshot = Readonly<{
  id: number;
  empresaId: number;
  nombre: string;
  codigo: string | null;
  cuenta: string | null;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export interface PaymentBankRepositoryPort {
  create(input: {
    empresaId: number;
    nombre: string;
    codigo?: string | null;
    cuenta?: string | null;
    activo: boolean;
  }): Promise<PaymentBankSnapshot>;

  update(input: {
    id: number;
    empresaId: number;
    nombre?: string;
    codigo?: string | null;
    cuenta?: string | null;
    activo?: boolean;
  }): Promise<PaymentBankSnapshot>;
}
