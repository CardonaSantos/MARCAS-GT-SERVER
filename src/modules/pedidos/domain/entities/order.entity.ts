import {
  OrderPaymentCondition,
  OrderPaymentState,
  OrderState,
} from '../../order.types';
import {
  OrderCreditApprovalRequiredError,
  OrderInvalidStateError,
  OrderValidationError,
} from '../errors/order.errors';
import { OrderMoney } from '../value-objects/order-money.vo';

export type OrderDetailProps = Readonly<{
  id?: number | null;
  productoId: number;
  cantidadSolicitada: number;
  cantidadReservada?: number;
  cantidadDespachada?: number;
  cantidadEntregada?: number;
  precioUnitario: string;
  descuento?: string;
  subtotal?: string;
  observaciones?: string | null;
  version?: number;
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export type OrderProps = Readonly<{
  id?: number | null;
  numero?: string | null;
  empresaId: number;
  clienteId: number;
  vendedorId: number;
  visitaId?: number | null;
  estado?: OrderState;
  condicionPago: OrderPaymentCondition;
  estadoPago?: OrderPaymentState;
  moneda?: string;
  subtotal?: string;
  descuentoTotal?: string;
  total?: string;
  observaciones?: string | null;
  validacionSolicitadaEn?: Date | null;
  confirmadoEn?: Date | null;
  motivoCancelacion?: string | null;
  canceladoEn?: Date | null;
  version?: number;
  detalles?: OrderDetailProps[];
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export class Pedido {
  private constructor(private props: OrderProps) {
    this.assertInvariants();
  }

  static create(
    props: Omit<
      OrderProps,
      | 'estado'
      | 'estadoPago'
      | 'subtotal'
      | 'descuentoTotal'
      | 'total'
      | 'version'
      | 'validacionSolicitadaEn'
      | 'confirmadoEn'
      | 'motivoCancelacion'
      | 'canceladoEn'
    >,
  ): Pedido {
    const details = normalizeDetails(props.detalles ?? []);
    const totals = calculateTotals(details);

    return new Pedido({
      ...props,
      numero: normalizeText(props.numero),
      estado: 'BORRADOR',
      estadoPago: 'PENDIENTE',
      moneda: normalizeCurrency(props.moneda ?? 'GTQ'),
      subtotal: totals.subtotal,
      descuentoTotal: totals.descuentoTotal,
      total: totals.total,
      observaciones: normalizeText(props.observaciones),
      detalles: details,
      version: 0,
    });
  }

  static rehydrate(props: OrderProps): Pedido {
    return new Pedido(props);
  }

  get id() { return this.props.id ?? null; }
  get numero() { return this.props.numero ?? null; }
  get empresaId() { return this.props.empresaId; }
  get clienteId() { return this.props.clienteId; }
  get vendedorId() { return this.props.vendedorId; }
  get visitaId() { return this.props.visitaId ?? null; }
  get estado() { return this.props.estado ?? 'BORRADOR'; }
  get condicionPago() { return this.props.condicionPago; }
  get estadoPago() { return this.props.estadoPago ?? 'PENDIENTE'; }
  get moneda() { return this.props.moneda ?? 'GTQ'; }
  get subtotal() { return this.props.subtotal ?? '0.00'; }
  get descuentoTotal() { return this.props.descuentoTotal ?? '0.00'; }
  get total() { return this.props.total ?? '0.00'; }
  get observaciones() { return this.props.observaciones ?? null; }
  get validacionSolicitadaEn() { return this.props.validacionSolicitadaEn ?? null; }
  get confirmadoEn() { return this.props.confirmadoEn ?? null; }
  get motivoCancelacion() { return this.props.motivoCancelacion ?? null; }
  get canceladoEn() { return this.props.canceladoEn ?? null; }
  get version() { return this.props.version ?? 0; }
  get detalles() { return this.props.detalles ?? []; }
  get creadoEn() { return this.props.creadoEn ?? new Date(); }
  get actualizadoEn() { return this.props.actualizadoEn ?? new Date(); }

  replaceDraftData(input: {
    clienteId?: number;
    vendedorId?: number;
    visitaId?: number | null;
    condicionPago?: OrderPaymentCondition;
    observaciones?: string | null;
    detalles?: OrderDetailProps[];
  }): void {
    this.assertState('BORRADOR', 'actualizar');

    if (
      this.detalles.some(
        (detail) =>
          (detail.cantidadReservada ?? 0) > 0 ||
          (detail.cantidadDespachada ?? 0) > 0 ||
          (detail.cantidadEntregada ?? 0) > 0,
      )
    ) {
      throw new OrderInvalidStateError(
        this.estado,
        'actualizar con actividad operativa',
      );
    }

    const details =
      input.detalles === undefined
        ? this.detalles
        : normalizeDetails(input.detalles);

    const totals = calculateTotals(details);

    this.props = {
      ...this.props,
      ...(input.clienteId !== undefined ? { clienteId: input.clienteId } : {}),
      ...(input.vendedorId !== undefined ? { vendedorId: input.vendedorId } : {}),
      ...(input.visitaId !== undefined ? { visitaId: input.visitaId } : {}),
      ...(input.condicionPago !== undefined
        ? { condicionPago: input.condicionPago }
        : {}),
      observaciones:
        input.observaciones === undefined
          ? this.observaciones
          : normalizeText(input.observaciones),
      detalles: details,
      subtotal: totals.subtotal,
      descuentoTotal: totals.descuentoTotal,
      total: totals.total,
      version: this.version + 1,
    };

    this.assertInvariants();
  }

  requestValidation(at = new Date()): void {
    this.assertState('BORRADOR', 'solicitar validación');

    if (this.detalles.length === 0) {
      throw new OrderValidationError(
        'El pedido debe contener al menos un producto para solicitar validación.',
      );
    }

    this.props = {
      ...this.props,
      estado: 'PENDIENTE_VALIDACION',
      validacionSolicitadaEn: at,
      version: this.version + 1,
    };
  }

  confirm(at = new Date(), creditApproved = false): void {
    this.assertState('PENDIENTE_VALIDACION', 'confirmar');

    if (
      ['CREDITO', 'MIXTO'].includes(this.condicionPago) &&
      !creditApproved
    ) {
      throw new OrderCreditApprovalRequiredError(this.condicionPago);
    }

    this.props = {
      ...this.props,
      estado: 'CONFIRMADO',
      confirmadoEn: at,
      version: this.version + 1,
    };
  }

  returnToDraftAfterCreditRejection(): void {
    if (
      this.estado !== 'PENDIENTE_VALIDACION' ||
      !['CREDITO', 'MIXTO'].includes(this.condicionPago)
    ) {
      throw new OrderInvalidStateError(
        this.estado,
        'retornar a borrador después de rechazo de crédito',
      );
    }

    this.props = {
      ...this.props,
      estado: 'BORRADOR',
      validacionSolicitadaEn: null,
      version: this.version + 1,
    };
  }

  cancel(reason: string, at = new Date()): void {
    if (!['BORRADOR', 'PENDIENTE_VALIDACION'].includes(this.estado)) {
      throw new OrderInvalidStateError(this.estado, 'cancelar');
    }

    const normalized = normalizeText(reason);
    if (!normalized || normalized.length < 3) {
      throw new OrderValidationError(
        'El motivo de cancelación debe contener al menos 3 caracteres.',
      );
    }

    this.props = {
      ...this.props,
      estado: 'CANCELADO',
      motivoCancelacion: normalized,
      canceladoEn: at,
      version: this.version + 1,
    };
  }

  private assertState(expected: OrderState, operation: string): void {
    if (this.estado !== expected) {
      throw new OrderInvalidStateError(this.estado, operation);
    }
  }

  private assertInvariants(): void {
    assertPositiveId(this.empresaId, 'empresaId');
    assertPositiveId(this.clienteId, 'clienteId');
    assertPositiveId(this.vendedorId, 'vendedorId');

    if (this.visitaId !== null) {
      assertPositiveId(this.visitaId, 'visitaId');
    }

    if (!Number.isInteger(this.version) || this.version < 0) {
      throw new OrderValidationError('La versión del pedido es inválida.');
    }

    if (!this.moneda.trim()) {
      throw new OrderValidationError('La moneda del pedido es inválida.');
    }

    const products = new Set<number>();
    for (const detail of this.detalles) {
      assertPositiveId(detail.productoId, 'productoId');

      if (products.has(detail.productoId)) {
        throw new OrderValidationError(
          'No se puede repetir el mismo producto en un pedido.',
          { productoId: detail.productoId },
        );
      }
      products.add(detail.productoId);

      if (
        !Number.isInteger(detail.cantidadSolicitada) ||
        detail.cantidadSolicitada <= 0
      ) {
        throw new OrderValidationError(
          'La cantidad solicitada debe ser un entero positivo.',
          { productoId: detail.productoId },
        );
      }

      const reserved = detail.cantidadReservada ?? 0;
      const dispatched = detail.cantidadDespachada ?? 0;
      const delivered = detail.cantidadEntregada ?? 0;
      const version = detail.version ?? 0;

      if (
        !Number.isInteger(reserved) ||
        !Number.isInteger(dispatched) ||
        !Number.isInteger(delivered) ||
        reserved < 0 ||
        dispatched < 0 ||
        delivered < 0 ||
        reserved + dispatched > detail.cantidadSolicitada ||
        delivered > dispatched
      ) {
        throw new OrderValidationError(
          'Las cantidades del detalle del pedido son inconsistentes.',
          { productoId: detail.productoId },
        );
      }

      if (!Number.isInteger(version) || version < 0) {
        throw new OrderValidationError(
          'La versión del detalle del pedido es inválida.',
          { productoId: detail.productoId },
        );
      }

      const unit = OrderMoney.from(detail.precioUnitario);
      const discount = OrderMoney.from(detail.descuento ?? '0.00');
      const gross = unit.multiply(detail.cantidadSolicitada);
      const net = gross.subtract(discount);

      if (!net.equals(OrderMoney.from(detail.subtotal ?? '0.00'))) {
        throw new OrderValidationError(
          'El subtotal del detalle del pedido es inconsistente.',
          { productoId: detail.productoId },
        );
      }
    }

    const totals = calculateTotals(this.detalles);
    if (
      totals.subtotal !== OrderMoney.from(this.subtotal).toString() ||
      totals.descuentoTotal !== OrderMoney.from(this.descuentoTotal).toString() ||
      totals.total !== OrderMoney.from(this.total).toString()
    ) {
      throw new OrderValidationError(
        'Los totales generales del pedido son inconsistentes.',
      );
    }
  }
}

function normalizeDetails(details: OrderDetailProps[]): OrderDetailProps[] {
  return details.map((detail) => {
    const unit = OrderMoney.from(detail.precioUnitario);
    const discount = OrderMoney.from(detail.descuento ?? '0.00');
    const gross = unit.multiply(detail.cantidadSolicitada);
    const net = gross.subtract(discount);

    return {
      ...detail,
      cantidadReservada: detail.cantidadReservada ?? 0,
      cantidadDespachada: detail.cantidadDespachada ?? 0,
      cantidadEntregada: detail.cantidadEntregada ?? 0,
      precioUnitario: unit.toString(),
      descuento: discount.toString(),
      subtotal: net.toString(),
      observaciones: normalizeText(detail.observaciones),
      version: detail.version ?? 0,
    };
  });
}

function calculateTotals(details: OrderDetailProps[]) {
  let gross = OrderMoney.zero();
  let discounts = OrderMoney.zero();

  for (const detail of details) {
    const unit = OrderMoney.from(detail.precioUnitario);
    const discount = OrderMoney.from(detail.descuento ?? '0.00');
    gross = gross.add(unit.multiply(detail.cantidadSolicitada));
    discounts = discounts.add(discount);
  }

  return {
    subtotal: gross.toString(),
    descuentoTotal: discounts.toString(),
    total: gross.subtract(discounts).toString(),
  };
}

function normalizeText(value?: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new OrderValidationError('La moneda del pedido es inválida.');
  }
  return normalized;
}

function assertPositiveId(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new OrderValidationError(`El campo ${field} es inválido.`, {
      [field]: value,
    });
  }
}
