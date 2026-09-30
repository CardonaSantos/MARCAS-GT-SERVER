import {
  InsufficientAvailableStockError,
  InsufficientReservedStockError,
  InvalidInventoryQuantityError,
} from '../errors/inventory.errors';
import { StockSnapshot } from '../inventory.types';
import { InventoryCost } from '../value-objects/inventory-cost.vo';

export type StockBodegaProps = Readonly<{
  id?: number;
  bodegaId: number;
  productoId: number;
  cantidadReal: number;
  cantidadReservada: number;
  cantidadDisponible: number;
  costoPromedio: InventoryCost;
  version: number;
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export class StockBodega {
  private constructor(private props: StockBodegaProps) {
    this.assertInvariant();
  }

  static create(bodegaId: number, productoId: number): StockBodega {
    return new StockBodega({
      bodegaId,
      productoId,
      cantidadReal: 0,
      cantidadReservada: 0,
      cantidadDisponible: 0,
      costoPromedio: InventoryCost.zero(),
      version: 0,
    });
  }

  static rehydrate(props: StockBodegaProps): StockBodega {
    return new StockBodega(props);
  }

  get id() { return this.props.id; }
  get bodegaId() { return this.props.bodegaId; }
  get productoId() { return this.props.productoId; }
  get cantidadReal() { return this.props.cantidadReal; }
  get cantidadReservada() { return this.props.cantidadReservada; }
  get cantidadDisponible() { return this.props.cantidadDisponible; }
  get costoPromedio() { return this.props.costoPromedio; }
  get version() { return this.props.version; }
  get creadoEn() { return this.props.creadoEn; }
  get actualizadoEn() { return this.props.actualizadoEn; }

  snapshot(): StockSnapshot {
    return {
      cantidadReal: this.cantidadReal,
      cantidadReservada: this.cantidadReservada,
      cantidadDisponible: this.cantidadDisponible,
      costoPromedio: this.costoPromedio.toString(),
    };
  }

  registerEntry(quantity: number, unitCost?: InventoryCost | null): void {
    this.assertPositiveQuantity(quantity);

    const nextCost = unitCost
      ? InventoryCost.weightedAverage(
          this.cantidadReal,
          this.costoPromedio,
          quantity,
          unitCost,
        )
      : this.costoPromedio;

    this.change({
      cantidadReal: this.cantidadReal + quantity,
      cantidadReservada: this.cantidadReservada,
      costoPromedio: nextCost,
    });
  }

  registerAvailableExit(quantity: number): void {
    this.assertPositiveQuantity(quantity);
    if (quantity > this.cantidadDisponible) {
      throw new InsufficientAvailableStockError(this.cantidadDisponible, quantity);
    }

    this.change({
      cantidadReal: this.cantidadReal - quantity,
      cantidadReservada: this.cantidadReservada,
      costoPromedio: this.costoPromedio,
    });
  }

  reserve(quantity: number): void {
    this.assertPositiveQuantity(quantity);
    if (quantity > this.cantidadDisponible) {
      throw new InsufficientAvailableStockError(this.cantidadDisponible, quantity);
    }

    this.change({
      cantidadReal: this.cantidadReal,
      cantidadReservada: this.cantidadReservada + quantity,
      costoPromedio: this.costoPromedio,
    });
  }

  releaseReservation(quantity: number): void {
    this.assertPositiveQuantity(quantity);
    if (quantity > this.cantidadReservada) {
      throw new InsufficientReservedStockError(this.cantidadReservada, quantity);
    }

    this.change({
      cantidadReal: this.cantidadReal,
      cantidadReservada: this.cantidadReservada - quantity,
      costoPromedio: this.costoPromedio,
    });
  }

  applyReservedExit(quantity: number): void {
    this.assertPositiveQuantity(quantity);
    if (quantity > this.cantidadReservada) {
      throw new InsufficientReservedStockError(this.cantidadReservada, quantity);
    }

    this.change({
      cantidadReal: this.cantidadReal - quantity,
      cantidadReservada: this.cantidadReservada - quantity,
      costoPromedio: this.costoPromedio,
    });
  }

  private change(input: {
    cantidadReal: number;
    cantidadReservada: number;
    costoPromedio: InventoryCost;
  }): void {
    const cantidadDisponible = input.cantidadReal - input.cantidadReservada;
    this.props = {
      ...this.props,
      ...input,
      cantidadDisponible,
      version: this.version + 1,
    };
    this.assertInvariant();
  }

  private assertPositiveQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidInventoryQuantityError(quantity);
    }
  }

  private assertInvariant(): void {
    const { cantidadReal, cantidadReservada, cantidadDisponible, version } = this.props;
    if (
      !Number.isInteger(cantidadReal) ||
      !Number.isInteger(cantidadReservada) ||
      !Number.isInteger(cantidadDisponible) ||
      cantidadReal < 0 ||
      cantidadReservada < 0 ||
      cantidadDisponible < 0 ||
      cantidadReservada > cantidadReal ||
      cantidadDisponible !== cantidadReal - cantidadReservada ||
      !Number.isInteger(version) ||
      version < 0
    ) {
      throw new Error('StockBodega fue construido con un estado inválido.');
    }
  }
}
