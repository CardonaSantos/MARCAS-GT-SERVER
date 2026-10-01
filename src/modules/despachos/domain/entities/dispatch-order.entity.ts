import {
  DispatchInvalidStateError,
  DispatchQuantityExceededError,
  DispatchValidationError,
} from '../errors/dispatch.errors';
import { DispatchState } from '../../dispatch.types';

export type DispatchDetailProps = Readonly<{
  id?: number | null;
  pedidoDetalleId: number;
  productoId: number;
  cantidadProgramada: number;
  cantidadPreparada?: number;
  cantidadDespachada?: number;
  observaciones?: string | null;
  version?: number;
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export type DispatchOrderProps = Readonly<{
  id?: number | null;
  pedidoId: number;
  bodegaId: number;
  creadoPorId?: number | null;
  preparadoPorId?: number | null;
  despachadoPorId?: number | null;
  canceladoPorId?: number | null;
  numero?: string | null;
  estado?: DispatchState;
  programadoEn?: Date | null;
  preparacionIniciadaEn?: Date | null;
  preparadoEn?: Date | null;
  despachadoEn?: Date | null;
  canceladoEn?: Date | null;
  motivoCancelacion?: string | null;
  observaciones?: string | null;
  version?: number;
  detalles?: DispatchDetailProps[];
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export class OrdenDespacho {
  private constructor(private props: DispatchOrderProps) {
    this.assertInvariants();
  }

  static create(
    props: Omit<
      DispatchOrderProps,
      | 'estado'
      | 'version'
      | 'preparadoPorId'
      | 'despachadoPorId'
      | 'canceladoPorId'
      | 'preparacionIniciadaEn'
      | 'preparadoEn'
      | 'despachadoEn'
      | 'canceladoEn'
      | 'motivoCancelacion'
    >,
  ): OrdenDespacho {
    return new OrdenDespacho({
      ...props,
      numero: normalizeText(props.numero),
      estado: 'PENDIENTE',
      preparadoPorId: null,
      despachadoPorId: null,
      canceladoPorId: null,
      preparacionIniciadaEn: null,
      preparadoEn: null,
      despachadoEn: null,
      canceladoEn: null,
      motivoCancelacion: null,
      observaciones: normalizeText(props.observaciones),
      detalles: normalizeDetails(props.detalles ?? []),
      version: 0,
    });
  }

  static rehydrate(props: DispatchOrderProps): OrdenDespacho {
    return new OrdenDespacho(props);
  }

  get id() { return this.props.id ?? null; }
  get pedidoId() { return this.props.pedidoId; }
  get bodegaId() { return this.props.bodegaId; }
  get creadoPorId() { return this.props.creadoPorId ?? null; }
  get preparadoPorId() { return this.props.preparadoPorId ?? null; }
  get despachadoPorId() { return this.props.despachadoPorId ?? null; }
  get canceladoPorId() { return this.props.canceladoPorId ?? null; }
  get numero() { return this.props.numero ?? null; }
  get estado() { return this.props.estado ?? 'PENDIENTE'; }
  get programadoEn() { return this.props.programadoEn ?? null; }
  get preparacionIniciadaEn() { return this.props.preparacionIniciadaEn ?? null; }
  get preparadoEn() { return this.props.preparadoEn ?? null; }
  get despachadoEn() { return this.props.despachadoEn ?? null; }
  get canceladoEn() { return this.props.canceladoEn ?? null; }
  get motivoCancelacion() { return this.props.motivoCancelacion ?? null; }
  get observaciones() { return this.props.observaciones ?? null; }
  get version() { return this.props.version ?? 0; }
  get detalles() { return this.props.detalles ?? []; }
  get creadoEn() { return this.props.creadoEn ?? new Date(); }
  get actualizadoEn() { return this.props.actualizadoEn ?? new Date(); }

  replacePendingData(input: {
    bodegaId?: number;
    programadoEn?: Date | null;
    observaciones?: string | null;
    detalles?: DispatchDetailProps[];
  }): void {
    this.assertState('PENDIENTE', 'actualizar');
    this.props = {
      ...this.props,
      ...(input.bodegaId !== undefined ? { bodegaId: input.bodegaId } : {}),
      ...(input.programadoEn !== undefined ? { programadoEn: input.programadoEn } : {}),
      ...(input.detalles !== undefined ? { detalles: normalizeDetails(input.detalles) } : {}),
      observaciones:
        input.observaciones === undefined
          ? this.observaciones
          : normalizeText(input.observaciones),
      version: this.version + 1,
    };
    this.assertInvariants();
  }

  markPreparationStarted(at = new Date()): void {
    if (this.estado === 'PREPARANDO') return;
    this.assertState('PENDIENTE', 'iniciar preparación');
    this.props = {
      ...this.props,
      estado: 'PREPARANDO',
      preparacionIniciadaEn: at,
      version: this.version + 1,
    };
  }

  updatePreparation(lines: ReadonlyArray<{
    detalleId: number;
    cantidadPreparada: number;
    observaciones?: string | null;
  }>): void {
    this.assertState('PREPARANDO', 'actualizar preparación');
    if (!lines.length) {
      throw new DispatchValidationError('Debe indicarse al menos una línea de preparación.');
    }

    const requested = new Map(lines.map((line) => [line.detalleId, line]));
    const found = new Set<number>();

    const details = this.detalles.map((detail) => {
      const id = detail.id ?? null;
      if (!id || !requested.has(id)) return detail;
      const line = requested.get(id)!;
      found.add(id);

      if (
        !Number.isInteger(line.cantidadPreparada) ||
        line.cantidadPreparada < (detail.cantidadDespachada ?? 0) ||
        line.cantidadPreparada > detail.cantidadProgramada
      ) {
        throw new DispatchQuantityExceededError({
          detalleId: id,
          programada: detail.cantidadProgramada,
          despachada: detail.cantidadDespachada ?? 0,
          preparadaSolicitada: line.cantidadPreparada,
        });
      }

      return {
        ...detail,
        cantidadPreparada: line.cantidadPreparada,
        observaciones:
          line.observaciones === undefined
            ? detail.observaciones ?? null
            : normalizeText(line.observaciones),
        version: (detail.version ?? 0) + 1,
      };
    });

    if (found.size !== requested.size) {
      throw new DispatchValidationError('Una o más líneas no pertenecen a la orden de despacho.');
    }

    this.props = { ...this.props, detalles: details, version: this.version + 1 };
    this.assertInvariants();
  }

  markPrepared(actorId: number, at = new Date()): void {
    this.assertState('PREPARANDO', 'finalizar preparación');
    if (
      this.detalles.length === 0 ||
      this.detalles.some(
        (detail) => (detail.cantidadPreparada ?? 0) !== detail.cantidadProgramada,
      )
    ) {
      throw new DispatchValidationError(
        'Todas las líneas deben estar completamente preparadas antes de finalizar.',
      );
    }
    this.props = {
      ...this.props,
      estado: 'PREPARADA',
      preparadoPorId: actorId,
      preparadoEn: at,
      version: this.version + 1,
    };
  }

  cancel(reason: string, actorId: number, at = new Date()): void {
    if (!['PENDIENTE', 'PREPARANDO', 'PREPARADA'].includes(this.estado)) {
      throw new DispatchInvalidStateError(this.estado, 'cancelar');
    }
    if (this.detalles.some((detail) => (detail.cantidadDespachada ?? 0) > 0)) {
      throw new DispatchInvalidStateError(this.estado, 'cancelar después de una salida física');
    }
    const normalized = normalizeText(reason);
    if (!normalized || normalized.length < 3) {
      throw new DispatchValidationError(
        'El motivo de cancelación debe contener al menos 3 caracteres.',
      );
    }
    this.props = {
      ...this.props,
      estado: 'CANCELADA',
      canceladoPorId: actorId,
      canceladoEn: at,
      motivoCancelacion: normalized,
      version: this.version + 1,
    };
  }

  private assertState(expected: DispatchState, operation: string): void {
    if (this.estado !== expected) {
      throw new DispatchInvalidStateError(this.estado, operation);
    }
  }

  private assertInvariants(): void {
    assertPositiveId(this.pedidoId, 'pedidoId');
    assertPositiveId(this.bodegaId, 'bodegaId');
    if (this.creadoPorId != null) assertPositiveId(this.creadoPorId, 'creadoPorId');
    if (this.preparadoPorId != null) assertPositiveId(this.preparadoPorId, 'preparadoPorId');
    if (this.despachadoPorId != null) assertPositiveId(this.despachadoPorId, 'despachadoPorId');
    if (this.canceladoPorId != null) assertPositiveId(this.canceladoPorId, 'canceladoPorId');

    if (!Number.isInteger(this.version) || this.version < 0) {
      throw new DispatchValidationError('La versión del despacho es inválida.');
    }
    if (this.detalles.length === 0) {
      throw new DispatchValidationError('La orden de despacho debe contener al menos una línea.');
    }

    const orderDetails = new Set<number>();
    for (const detail of this.detalles) {
      assertPositiveId(detail.pedidoDetalleId, 'pedidoDetalleId');
      assertPositiveId(detail.productoId, 'productoId');
      if (orderDetails.has(detail.pedidoDetalleId)) {
        throw new DispatchValidationError(
          'No se puede repetir el mismo detalle de pedido en un despacho.',
          { pedidoDetalleId: detail.pedidoDetalleId },
        );
      }
      orderDetails.add(detail.pedidoDetalleId);

      const prepared = detail.cantidadPreparada ?? 0;
      const dispatched = detail.cantidadDespachada ?? 0;
      const version = detail.version ?? 0;
      if (
        !Number.isInteger(detail.cantidadProgramada) ||
        !Number.isInteger(prepared) ||
        !Number.isInteger(dispatched) ||
        detail.cantidadProgramada <= 0 ||
        prepared < 0 ||
        dispatched < 0 ||
        dispatched > prepared ||
        prepared > detail.cantidadProgramada
      ) {
        throw new DispatchValidationError(
          'Las cantidades de la línea de despacho son inconsistentes.',
          { pedidoDetalleId: detail.pedidoDetalleId },
        );
      }
      if (!Number.isInteger(version) || version < 0) {
        throw new DispatchValidationError(
          'La versión de una línea de despacho es inválida.',
          { pedidoDetalleId: detail.pedidoDetalleId },
        );
      }
    }
  }
}

function normalizeDetails(details: DispatchDetailProps[]): DispatchDetailProps[] {
  return details.map((detail) => ({
    ...detail,
    cantidadPreparada: detail.cantidadPreparada ?? 0,
    cantidadDespachada: detail.cantidadDespachada ?? 0,
    observaciones: normalizeText(detail.observaciones),
    version: detail.version ?? 0,
  }));
}

function normalizeText(value?: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function assertPositiveId(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DispatchValidationError(`El campo ${field} es inválido.`, { [field]: value });
  }
}
