import {
  PaymentApplicationState,
  PaymentEventType,
  PaymentMethod,
  PaymentState,
} from '../../payment.types';

export type PaymentSnapshot = Readonly<{
  id: number;
  empresaId: number;
  clienteId: number;
  pedidoId: number | null;
  bancoId: number | null;
  registradoPorId: number | null;
  verificadoPorId: number | null;
  rechazadoPorId: number | null;
  anuladoPorId: number | null;
  metodo: PaymentMethod;
  estado: PaymentState;
  moneda: string;
  monto: string;
  referencia: string | null;
  fechaPago: Date;
  verificadoEn: Date | null;
  rechazadoEn: Date | null;
  motivoRechazo: string | null;
  anuladoEn: Date | null;
  motivoAnulacion: string | null;
  observaciones: string | null;
  claveIdempotencia: string | null;
  version: number;
}>;

export type PaymentApplicationSnapshot = Readonly<{
  id: number;
  pagoId: number;
  cuentaPorCobrarId: number;
  monto: string;
  estado: PaymentApplicationState;
  aplicadoPorId: number | null;
  revertidaEn: Date | null;
  revertidaPorId: number | null;
  motivoReversion: string | null;
  claveIdempotencia: string | null;
  version: number;
}>;

export interface PaymentWorkflowPort {
  findById(id: number): Promise<PaymentSnapshot | null>;
  findByCreationKey(key: string): Promise<PaymentSnapshot | null>;
  findEventByKey(key: string): Promise<Readonly<{
    pagoId: number;
    tipo: PaymentEventType;
  }> | null>;
  findProofByKey(key: string): Promise<Readonly<{
    id: number;
    pagoId: number;
  }> | null>;
  findApplicationById(id: number): Promise<PaymentApplicationSnapshot | null>;
  findApplicationByKey(key: string): Promise<PaymentApplicationSnapshot | null>;

  register(input: {
    empresaId: number;
    clienteId: number;
    pedidoId: number | null;
    bancoId: number | null;
    registradoPorId: number;
    metodo: PaymentMethod;
    moneda: string;
    monto: string;
    referencia: string | null;
    fechaPago: Date;
    observaciones: string | null;
    claveIdempotencia: string;
  }): Promise<PaymentSnapshot>;

  addProof(input: {
    pagoId: number;
    expectedVersion: number;
    actorId: number;
    url: string;
    key: string | null;
    mimeType: string | null;
    size: number | null;
    descripcion: string | null;
    claveIdempotencia: string;
  }): Promise<Readonly<{ id: number; pagoId: number }>>;

  verify(input: {
    pagoId: number;
    expectedVersion: number;
    actorId: number;
    at: Date;
    claveIdempotencia: string;
  }): Promise<PaymentSnapshot>;

  reject(input: {
    pagoId: number;
    expectedVersion: number;
    actorId: number;
    at: Date;
    motivo: string;
    claveIdempotencia: string;
  }): Promise<PaymentSnapshot>;

  apply(input: {
    pagoId: number;
    expectedVersion: number;
    cuentaPorCobrarId: number;
    monto: string;
    actorId: number;
    claveIdempotencia: string;
  }): Promise<PaymentApplicationSnapshot>;

  reverseApplication(input: {
    pagoId: number;
    aplicacionId: number;
    actorId: number;
    motivo: string;
    claveIdempotencia: string;
  }): Promise<PaymentApplicationSnapshot>;

  void(input: {
    pagoId: number;
    expectedVersion: number;
    actorId: number;
    at: Date;
    motivo: string;
    claveIdempotencia: string;
  }): Promise<PaymentSnapshot>;
}
