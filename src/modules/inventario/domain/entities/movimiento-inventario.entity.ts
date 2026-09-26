import { InvalidInventoryQuantityError, InvalidInventoryReferenceError } from '../errors/inventory.errors';
import { InventoryMovementType, InventoryReference, StockSnapshot } from '../inventory.types';
import { InventoryCost } from '../value-objects/inventory-cost.vo';

export type MovimientoInventarioProps = Readonly<{
  id?: number;
  bodegaId: number;
  productoId: number;
  proveedorId: number | null;
  creadoPorId: number | null;
  reservaInventarioId: number | null;
  tipo: InventoryMovementType;
  cantidad: number;
  costoUnitario: InventoryCost | null;
  costoPromedioAntes: InventoryCost;
  costoPromedioDespues: InventoryCost;
  cantidadRealAntes: number;
  cantidadRealDespues: number;
  reservadaAntes: number;
  reservadaDespues: number;
  referenciaTipo: string | null;
  referenciaId: number | null;
  claveIdempotencia: string | null;
  observaciones: string | null;
  creadoEn?: Date;
}>;

export class MovimientoInventario {
  private constructor(private readonly props: MovimientoInventarioProps) {
    this.assertInvariant();
  }

  static create(input: {
    bodegaId: number;
    productoId: number;
    proveedorId?: number | null;
    creadoPorId?: number | null;
    reservaInventarioId?: number | null;
    tipo: InventoryMovementType;
    cantidad: number;
    costoUnitario?: InventoryCost | null;
    before: StockSnapshot;
    after: StockSnapshot;
    reference?: InventoryReference | null;
    claveIdempotencia?: string | null;
    observaciones?: string | null;
  }): MovimientoInventario {
    return new MovimientoInventario({
      bodegaId: input.bodegaId,
      productoId: input.productoId,
      proveedorId: input.proveedorId ?? null,
      creadoPorId: input.creadoPorId ?? null,
      reservaInventarioId: input.reservaInventarioId ?? null,
      tipo: input.tipo,
      cantidad: input.cantidad,
      costoUnitario: input.costoUnitario ?? null,
      costoPromedioAntes: InventoryCost.from(input.before.costoPromedio),
      costoPromedioDespues: InventoryCost.from(input.after.costoPromedio),
      cantidadRealAntes: input.before.cantidadReal,
      cantidadRealDespues: input.after.cantidadReal,
      reservadaAntes: input.before.cantidadReservada,
      reservadaDespues: input.after.cantidadReservada,
      referenciaTipo: input.reference?.type ?? null,
      referenciaId: input.reference?.id ?? null,
      claveIdempotencia: input.claveIdempotencia?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
    });
  }

  static rehydrate(props: MovimientoInventarioProps): MovimientoInventario {
    return new MovimientoInventario(props);
  }

  get id() { return this.props.id; }
  get bodegaId() { return this.props.bodegaId; }
  get productoId() { return this.props.productoId; }
  get proveedorId() { return this.props.proveedorId; }
  get creadoPorId() { return this.props.creadoPorId; }
  get reservaInventarioId() { return this.props.reservaInventarioId; }
  get tipo() { return this.props.tipo; }
  get cantidad() { return this.props.cantidad; }
  get costoUnitario() { return this.props.costoUnitario; }
  get costoPromedioAntes() { return this.props.costoPromedioAntes; }
  get costoPromedioDespues() { return this.props.costoPromedioDespues; }
  get cantidadRealAntes() { return this.props.cantidadRealAntes; }
  get cantidadRealDespues() { return this.props.cantidadRealDespues; }
  get reservadaAntes() { return this.props.reservadaAntes; }
  get reservadaDespues() { return this.props.reservadaDespues; }
  get referenciaTipo() { return this.props.referenciaTipo; }
  get referenciaId() { return this.props.referenciaId; }
  get claveIdempotencia() { return this.props.claveIdempotencia; }
  get observaciones() { return this.props.observaciones; }
  get creadoEn() { return this.props.creadoEn; }

  private assertInvariant(): void {
    if (!Number.isInteger(this.cantidad) || this.cantidad <= 0) {
      throw new InvalidInventoryQuantityError(this.cantidad);
    }
    if ((this.referenciaTipo === null) !== (this.referenciaId === null)) {
      throw new InvalidInventoryReferenceError();
    }
  }
}
