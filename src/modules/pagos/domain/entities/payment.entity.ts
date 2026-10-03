import {
  PaymentMethod,
  PaymentState,
} from '../../payment.types';
import {
  PaymentInvalidStateError,
  PaymentValidationError,
} from '../errors/payment.errors';
import { PaymentMoney } from '../value-objects/payment-money.vo';

export type PaymentProps = Readonly<{
  id?: number | null;
  empresaId: number;
  clienteId: number;
  pedidoId?: number | null;
  bancoId?: number | null;
  registradoPorId?: number | null;
  verificadoPorId?: number | null;
  rechazadoPorId?: number | null;
  anuladoPorId?: number | null;
  metodo: PaymentMethod;
  estado?: PaymentState;
  moneda?: string;
  monto: string;
  referencia?: string | null;
  fechaPago?: Date;
  verificadoEn?: Date | null;
  rechazadoEn?: Date | null;
  motivoRechazo?: string | null;
  anuladoEn?: Date | null;
  motivoAnulacion?: string | null;
  observaciones?: string | null;
  claveIdempotencia?: string | null;
  version?: number;
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export class Pago {
  private constructor(private props: PaymentProps) {
    this.assertInvariants();
  }

  static create(
    props: Omit<
      PaymentProps,
      | 'estado'
      | 'verificadoPorId'
      | 'rechazadoPorId'
      | 'anuladoPorId'
      | 'verificadoEn'
      | 'rechazadoEn'
      | 'motivoRechazo'
      | 'anuladoEn'
      | 'motivoAnulacion'
      | 'version'
    >,
  ): Pago {
    return new Pago({
      ...props,
      estado: 'PENDIENTE',
      moneda: normalizeCurrency(props.moneda ?? 'GTQ'),
      monto: PaymentMoney.from(props.monto).toString(),
      referencia: normalizeText(props.referencia),
      observaciones: normalizeText(props.observaciones),
      claveIdempotencia: normalizeText(props.claveIdempotencia),
      version: 0,
    });
  }

  static rehydrate(props: PaymentProps): Pago {
    return new Pago(props);
  }

  get id() { return this.props.id ?? null; }
  get empresaId() { return this.props.empresaId; }
  get clienteId() { return this.props.clienteId; }
  get pedidoId() { return this.props.pedidoId ?? null; }
  get bancoId() { return this.props.bancoId ?? null; }
  get registradoPorId() { return this.props.registradoPorId ?? null; }
  get verificadoPorId() { return this.props.verificadoPorId ?? null; }
  get rechazadoPorId() { return this.props.rechazadoPorId ?? null; }
  get anuladoPorId() { return this.props.anuladoPorId ?? null; }
  get metodo() { return this.props.metodo; }
  get estado() { return this.props.estado ?? 'PENDIENTE'; }
  get moneda() { return normalizeCurrency(this.props.moneda ?? 'GTQ'); }
  get monto() { return PaymentMoney.from(this.props.monto).toString(); }
  get referencia() { return this.props.referencia ?? null; }
  get fechaPago() { return this.props.fechaPago ?? new Date(); }
  get verificadoEn() { return this.props.verificadoEn ?? null; }
  get rechazadoEn() { return this.props.rechazadoEn ?? null; }
  get motivoRechazo() { return this.props.motivoRechazo ?? null; }
  get anuladoEn() { return this.props.anuladoEn ?? null; }
  get motivoAnulacion() { return this.props.motivoAnulacion ?? null; }
  get observaciones() { return this.props.observaciones ?? null; }
  get claveIdempotencia() { return this.props.claveIdempotencia ?? null; }
  get version() { return this.props.version ?? 0; }

  verify(actorId: number, at = new Date()): void {
    this.assertState('PENDIENTE', 'verificar');
    assertPositiveId(actorId, 'actorId');
    this.props = {
      ...this.props,
      estado: 'VERIFICADO',
      verificadoPorId: actorId,
      verificadoEn: at,
      version: this.version + 1,
    };
  }

  reject(reason: string, actorId: number, at = new Date()): void {
    this.assertState('PENDIENTE', 'rechazar');
    assertPositiveId(actorId, 'actorId');
    const normalized = requireReason(reason);
    this.props = {
      ...this.props,
      estado: 'RECHAZADO',
      rechazadoPorId: actorId,
      rechazadoEn: at,
      motivoRechazo: normalized,
      version: this.version + 1,
    };
  }

  void(reason: string, actorId: number, at = new Date()): void {
    this.assertState('VERIFICADO', 'anular');
    assertPositiveId(actorId, 'actorId');
    const normalized = requireReason(reason);
    this.props = {
      ...this.props,
      estado: 'ANULADO',
      anuladoPorId: actorId,
      anuladoEn: at,
      motivoAnulacion: normalized,
      version: this.version + 1,
    };
  }

  private assertState(expected: PaymentState, operation: string): void {
    if (this.estado !== expected) {
      throw new PaymentInvalidStateError(this.estado, operation);
    }
  }

  private assertInvariants(): void {
    assertPositiveId(this.empresaId, 'empresaId');
    assertPositiveId(this.clienteId, 'clienteId');
    if (this.pedidoId !== null) assertPositiveId(this.pedidoId, 'pedidoId');
    if (this.bancoId !== null) assertPositiveId(this.bancoId, 'bancoId');

    if (!PaymentMoney.from(this.monto).isPositive()) {
      throw new PaymentValidationError('El monto del pago debe ser mayor a cero.');
    }

    if (!this.moneda.trim()) {
      throw new PaymentValidationError('La moneda del pago es inválida.');
    }

    if (!Number.isInteger(this.version) || this.version < 0) {
      throw new PaymentValidationError('La versión del pago es inválida.');
    }

    if (
      ['TRANSFERENCIA_BANCO', 'DEPOSITO', 'CHEQUE'].includes(this.metodo) &&
      (!this.bancoId || !normalizeText(this.referencia))
    ) {
      throw new PaymentValidationError(
        'Transferencias, depósitos y cheques requieren banco y referencia.',
      );
    }
  }
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new PaymentValidationError('La moneda del pago es inválida.');
  return normalized;
}

function normalizeText(value?: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function requireReason(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length < 3) {
    throw new PaymentValidationError('El motivo debe contener al menos 3 caracteres.');
  }
  return normalized;
}

function assertPositiveId(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PaymentValidationError(`El campo ${field} es inválido.`, {
      [field]: value,
    });
  }
}
