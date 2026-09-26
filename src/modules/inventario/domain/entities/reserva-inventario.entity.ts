import {
  InventoryReservationClosedError,
  InventoryReservationQuantityExceededError,
  InvalidInventoryQuantityError,
} from '../errors/inventory.errors';
import { InventoryReservationState } from '../inventory.types';

export type ReservaInventarioProps = Readonly<{
  id?: number;
  pedidoDetalleId: number;
  stockBodegaId: number;
  cantidadOriginal: number;
  cantidadPendiente: number;
  cantidadAplicada: number;
  cantidadLiberada: number;
  estado: InventoryReservationState;
  aplicadaEn: Date | null;
  liberadaEn: Date | null;
  cerradaEn: Date | null;
  canceladaEn: Date | null;
  version: number;
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export class ReservaInventario {
  private constructor(private props: ReservaInventarioProps) {
    this.assertInvariant();
  }

  static create(pedidoDetalleId: number, stockBodegaId: number, quantity: number): ReservaInventario {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidInventoryQuantityError(quantity);
    }

    return new ReservaInventario({
      pedidoDetalleId,
      stockBodegaId,
      cantidadOriginal: quantity,
      cantidadPendiente: quantity,
      cantidadAplicada: 0,
      cantidadLiberada: 0,
      estado: 'ACTIVA',
      aplicadaEn: null,
      liberadaEn: null,
      cerradaEn: null,
      canceladaEn: null,
      version: 0,
    });
  }

  static rehydrate(props: ReservaInventarioProps): ReservaInventario {
    return new ReservaInventario(props);
  }

  get id() { return this.props.id; }
  get pedidoDetalleId() { return this.props.pedidoDetalleId; }
  get stockBodegaId() { return this.props.stockBodegaId; }
  get cantidadOriginal() { return this.props.cantidadOriginal; }
  get cantidadPendiente() { return this.props.cantidadPendiente; }
  get cantidadAplicada() { return this.props.cantidadAplicada; }
  get cantidadLiberada() { return this.props.cantidadLiberada; }
  get estado() { return this.props.estado; }
  get aplicadaEn() { return this.props.aplicadaEn; }
  get liberadaEn() { return this.props.liberadaEn; }
  get cerradaEn() { return this.props.cerradaEn; }
  get canceladaEn() { return this.props.canceladaEn; }
  get version() { return this.props.version; }
  get creadoEn() { return this.props.creadoEn; }
  get actualizadoEn() { return this.props.actualizadoEn; }

  isClosed(): boolean {
    return this.cantidadPendiente === 0;
  }

  increase(quantity: number): void {
    this.assertPositiveQuantity(quantity);
    this.assertOpen();

    this.props = {
      ...this.props,
      cantidadOriginal: this.cantidadOriginal + quantity,
      cantidadPendiente: this.cantidadPendiente + quantity,
      estado: this.cantidadAplicada > 0 || this.cantidadLiberada > 0 ? 'PARCIAL' : 'ACTIVA',
      version: this.version + 1,
    };
    this.assertInvariant();
  }

  apply(quantity: number, now = new Date()): void {
    this.assertOperableQuantity(quantity);
    const cantidadPendiente = this.cantidadPendiente - quantity;
    const cantidadAplicada = this.cantidadAplicada + quantity;
    const closed = cantidadPendiente === 0;
    const estado: InventoryReservationState = closed
      ? this.cantidadLiberada > 0
        ? 'FINALIZADA_MIXTA'
        : 'APLICADA'
      : 'PARCIAL';

    this.props = {
      ...this.props,
      cantidadPendiente,
      cantidadAplicada,
      estado,
      aplicadaEn: estado === 'APLICADA' ? now : this.aplicadaEn,
      cerradaEn: closed ? now : null,
      version: this.version + 1,
    };
    this.assertInvariant();
  }

  release(quantity: number, now = new Date()): void {
    this.assertOperableQuantity(quantity);
    const cantidadPendiente = this.cantidadPendiente - quantity;
    const cantidadLiberada = this.cantidadLiberada + quantity;
    const closed = cantidadPendiente === 0;
    const estado: InventoryReservationState = closed
      ? this.cantidadAplicada > 0
        ? 'FINALIZADA_MIXTA'
        : 'LIBERADA'
      : 'PARCIAL';

    this.props = {
      ...this.props,
      cantidadPendiente,
      cantidadLiberada,
      estado,
      liberadaEn: estado === 'LIBERADA' ? now : this.liberadaEn,
      cerradaEn: closed ? now : null,
      version: this.version + 1,
    };
    this.assertInvariant();
  }

  cancel(now = new Date()): number {
    this.assertOpen();
    const quantity = this.cantidadPendiente;
    this.props = {
      ...this.props,
      cantidadPendiente: 0,
      cantidadLiberada: this.cantidadLiberada + quantity,
      estado: this.cantidadAplicada > 0 ? 'FINALIZADA_MIXTA' : 'CANCELADA',
      canceladaEn: now,
      liberadaEn: this.cantidadAplicada === 0 ? now : this.liberadaEn,
      cerradaEn: now,
      version: this.version + 1,
    };
    this.assertInvariant();
    return quantity;
  }

  private assertOperableQuantity(quantity: number): void {
    this.assertPositiveQuantity(quantity);
    this.assertOpen();
    if (quantity > this.cantidadPendiente) {
      throw new InventoryReservationQuantityExceededError(this.cantidadPendiente, quantity);
    }
  }

  private assertOpen(): void {
    if (this.isClosed()) throw new InventoryReservationClosedError(this.id);
  }

  private assertPositiveQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidInventoryQuantityError(quantity);
    }
  }

  private assertInvariant(): void {
    const p = this.props;
    if (
      !Number.isInteger(p.cantidadOriginal) ||
      !Number.isInteger(p.cantidadPendiente) ||
      !Number.isInteger(p.cantidadAplicada) ||
      !Number.isInteger(p.cantidadLiberada) ||
      p.cantidadOriginal <= 0 ||
      p.cantidadPendiente < 0 ||
      p.cantidadAplicada < 0 ||
      p.cantidadLiberada < 0 ||
      p.cantidadOriginal !== p.cantidadPendiente + p.cantidadAplicada + p.cantidadLiberada ||
      !Number.isInteger(p.version) ||
      p.version < 0
    ) {
      throw new Error('ReservaInventario fue construida con un estado inválido.');
    }
  }
}
