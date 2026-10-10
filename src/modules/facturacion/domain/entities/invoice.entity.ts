import { InvoiceState } from '../../billing.types';
import {
  BillingInvalidStateError,
  BillingValidationError,
} from '../errors/billing.errors';
import { BillingMoney } from '../value-objects/billing-money.vo';

export type InvoiceLineProps = Readonly<{
  productoId: number;
  pedidoDetalleId: number | null;
  entregaDetalleId: number | null;
  descripcion: string;
  bienOServicio: 'BIEN' | 'SERVICIO';
  unidadMedida: string;
  cantidad: number;
  precioUnitario: string;
  precioBruto: string;
  descuento: string;
  impuestoTotal: string;
  totalLinea: string;
}>;

export type InvoiceProps = Readonly<{
  id?: number | null;
  empresaId: number;
  clienteId: number;
  pedidoId?: number | null;
  creadoPorId?: number | null;
  estado?: InvoiceState;
  condicionPago?: string | null;
  moneda: string;
  subtotal: string;
  descuentoTotal: string;
  impuestoTotal: string;
  total: string;
  version?: number;
  emitidaEn?: Date | null;
  descartadaEn?: Date | null;
  motivoDescarte?: string | null;
  anuladaEn?: Date | null;
  motivoAnulacion?: string | null;
  detalles: readonly InvoiceLineProps[];
}>;

export class Invoice {
  private constructor(private props: InvoiceProps) {
    this.assertInvariants();
  }

  static create(
    props: Omit<
      InvoiceProps,
      'estado' | 'version' | 'emitidaEn' | 'descartadaEn' | 'motivoDescarte' | 'anuladaEn' | 'motivoAnulacion'
    >,
  ): Invoice {
    return new Invoice({
      ...props,
      estado: 'BORRADOR',
      version: 0,
      emitidaEn: null,
      descartadaEn: null,
      motivoDescarte: null,
      anuladaEn: null,
      motivoAnulacion: null,
    });
  }

  static rehydrate(props: InvoiceProps): Invoice {
    return new Invoice(props);
  }

  get id() { return this.props.id ?? null; }
  get empresaId() { return this.props.empresaId; }
  get clienteId() { return this.props.clienteId; }
  get pedidoId() { return this.props.pedidoId ?? null; }
  get creadoPorId() { return this.props.creadoPorId ?? null; }
  get estado() { return this.props.estado ?? 'BORRADOR'; }
  get condicionPago() { return this.props.condicionPago ?? null; }
  get moneda() { return this.props.moneda; }
  get subtotal() { return this.props.subtotal; }
  get descuentoTotal() { return this.props.descuentoTotal; }
  get impuestoTotal() { return this.props.impuestoTotal; }
  get total() { return this.props.total; }
  get version() { return this.props.version ?? 0; }
  get detalles() { return this.props.detalles; }
  get emitidaEn() { return this.props.emitidaEn ?? null; }
  get descartadaEn() { return this.props.descartadaEn ?? null; }
  get motivoDescarte() { return this.props.motivoDescarte ?? null; }

  discard(reason: string, at = new Date()): void {
    this.assertState('BORRADOR', 'descartar');
    const normalized = reason.trim();
    if (normalized.length < 3) {
      throw new BillingValidationError(
        'El motivo de descarte debe contener al menos 3 caracteres.',
      );
    }
    this.props = {
      ...this.props,
      estado: 'DESCARTADA',
      descartadaEn: at,
      motivoDescarte: normalized,
      version: this.version + 1,
    };
  }

  markPrepared(): void {
    this.assertState('BORRADOR', 'preparar para emisión');
    this.props = {
      ...this.props,
      estado: 'LISTA_EMISION',
      version: this.version + 1,
    };
  }

  markIssued(at = new Date()): void {
    this.assertState('LISTA_EMISION', 'marcar como emitida');
    this.props = {
      ...this.props,
      estado: 'EMITIDA',
      emitidaEn: at,
      version: this.version + 1,
    };
  }

  assertEditable(): void {
    this.assertState('BORRADOR', 'editar');
  }

  private assertState(expected: InvoiceState, action: string): void {
    if (this.estado !== expected) {
      throw new BillingInvalidStateError(this.estado, action);
    }
  }

  private assertInvariants(): void {
    for (const [field, value] of [
      ['empresaId', this.empresaId],
      ['clienteId', this.clienteId],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new BillingValidationError(`El campo ${field} es inválido.`, { [field]: value });
      }
    }

    if (!this.moneda.trim()) {
      throw new BillingValidationError('La moneda de la factura es inválida.');
    }
    if (!Number.isInteger(this.version) || this.version < 0) {
      throw new BillingValidationError('La versión de la factura es inválida.');
    }
    if (!this.detalles.length) {
      throw new BillingValidationError('La factura debe contener al menos un detalle.');
    }

    let gross = BillingMoney.zero();
    let discounts = BillingMoney.zero();
    let taxes = BillingMoney.zero();
    let total = BillingMoney.zero();

    for (const detail of this.detalles) {
      if (!Number.isInteger(detail.cantidad) || detail.cantidad <= 0) {
        throw new BillingValidationError('La cantidad facturada debe ser positiva.', {
          productoId: detail.productoId,
        });
      }
      if (!detail.descripcion.trim() || !detail.unidadMedida.trim()) {
        throw new BillingValidationError('El snapshot fiscal del detalle está incompleto.', {
          productoId: detail.productoId,
        });
      }

      const unit = BillingMoney.from(detail.precioUnitario);
      const expectedGross = unit.multiply(detail.cantidad);
      const lineGross = BillingMoney.from(detail.precioBruto);
      const lineDiscount = BillingMoney.from(detail.descuento);
      const lineTaxes = BillingMoney.from(detail.impuestoTotal);
      const lineTotal = BillingMoney.from(detail.totalLinea);

      if (!expectedGross.equals(lineGross)) {
        throw new BillingValidationError('El precio bruto del detalle es inconsistente.', {
          productoId: detail.productoId,
        });
      }
      if (!lineGross.subtract(lineDiscount).equals(lineTotal)) {
        throw new BillingValidationError('El total del detalle es inconsistente.', {
          productoId: detail.productoId,
        });
      }

      gross = gross.add(lineGross);
      discounts = discounts.add(lineDiscount);
      taxes = taxes.add(lineTaxes);
      total = total.add(lineTotal);
    }

    if (
      !gross.equals(BillingMoney.from(this.subtotal)) ||
      !discounts.equals(BillingMoney.from(this.descuentoTotal)) ||
      !taxes.equals(BillingMoney.from(this.impuestoTotal)) ||
      !total.equals(BillingMoney.from(this.total))
    ) {
      throw new BillingValidationError('Los totales generales de la factura son inconsistentes.');
    }

    if (this.estado === 'DESCARTADA' && !this.descartadaEn) {
      throw new BillingValidationError('Una factura descartada debe registrar su fecha de descarte.');
    }
  }
}
