import {
  TransportInvalidStateError,
  TransportValidationError,
} from '../errors/transport.errors';
import { ShipmentMode, ShipmentState } from '../../transport.types';

export type ShipmentLoadLine = Readonly<{
  ordenDespachoDetalleId: number;
  productoId: number;
  cantidadPlanificada: number;
  cantidadCargada?: number;
}>;

export type ShipmentStop = Readonly<{
  ordenDespachoId: number;
  clienteId: number;
  secuencia: number;
  destinatario: string;
  telefonoDestino?: string | null;
  direccionDestino: string;
  latitudDestino?: number | null;
  longitudDestino?: number | null;
  cargas: readonly ShipmentLoadLine[];
}>;

export type ShipmentProps = Readonly<{
  id?: number | null;
  numero?: string | null;

  empresaId: number;
  bodegaId: number;
  modalidad: ShipmentMode;

  estado?: ShipmentState;
  version?: number;

  transportistaId?: number | null;
  vehiculoId?: number | null;
  conductorId?: number | null;
  responsableId?: number | null;

  salidaProgramadaEn?: Date | null;
  entregaEstimadaEn?: Date | null;

  guia?: string | null;
  costo?: number | null;
  trackingUrl?: string | null;
  comprobanteUrl?: string | null;
  observaciones?: string | null;

  paradas: readonly ShipmentStop[];
}>;

export class Shipment {
  private constructor(private readonly props: ShipmentProps) {
    this.assertInvariants();
  }

  static create(
    props: Omit<ShipmentProps, 'estado' | 'version'>,
  ): Shipment {
    return new Shipment({
      ...props,
      numero: normalizeText(props.numero),
      estado: 'PROGRAMADO',
      version: 0,
      guia: normalizeText(props.guia),
      trackingUrl: normalizeText(props.trackingUrl),
      comprobanteUrl: normalizeText(props.comprobanteUrl),
      observaciones: normalizeText(props.observaciones),
    });
  }

  static rehydrate(props: ShipmentProps): Shipment {
    return new Shipment({
      ...props,
      numero: normalizeText(props.numero),
      guia: normalizeText(props.guia),
      trackingUrl: normalizeText(props.trackingUrl),
      comprobanteUrl: normalizeText(props.comprobanteUrl),
      observaciones: normalizeText(props.observaciones),
    });
  }

  get id(): number | null {
    return this.props.id ?? null;
  }

  get numero(): string | null {
    return this.props.numero ?? null;
  }

  get empresaId(): number {
    return this.props.empresaId;
  }

  get bodegaId(): number {
    return this.props.bodegaId;
  }

  get modalidad(): ShipmentMode {
    return this.props.modalidad;
  }

  get estado(): ShipmentState {
    return this.props.estado ?? 'PROGRAMADO';
  }

  get version(): number {
    return this.props.version ?? 0;
  }

  get transportistaId(): number | null {
    return this.props.transportistaId ?? null;
  }

  get vehiculoId(): number | null {
    return this.props.vehiculoId ?? null;
  }

  get conductorId(): number | null {
    return this.props.conductorId ?? null;
  }

  get responsableId(): number | null {
    return this.props.responsableId ?? null;
  }

  get salidaProgramadaEn(): Date | null {
    return this.props.salidaProgramadaEn ?? null;
  }

  get entregaEstimadaEn(): Date | null {
    return this.props.entregaEstimadaEn ?? null;
  }

  get guia(): string | null {
    return this.props.guia ?? null;
  }

  get costo(): number | null {
    return this.props.costo ?? null;
  }

  get trackingUrl(): string | null {
    return this.props.trackingUrl ?? null;
  }

  get comprobanteUrl(): string | null {
    return this.props.comprobanteUrl ?? null;
  }

  get observaciones(): string | null {
    return this.props.observaciones ?? null;
  }

  get paradas(): readonly ShipmentStop[] {
    return this.props.paradas;
  }

  assertAssignable(): void {
    if (this.estado !== 'PROGRAMADO') {
      throw new TransportInvalidStateError(
        this.estado,
        'asignar recursos',
      );
    }
  }

  assertLoadConfirmable(): void {
    if (this.estado !== 'ASIGNADO') {
      throw new TransportInvalidStateError(
        this.estado,
        'confirmar carga',
      );
    }
  }

  assertRouteStartable(): void {
    if (this.estado !== 'CARGADO') {
      throw new TransportInvalidStateError(
        this.estado,
        'iniciar ruta',
      );
    }
  }

  assertCancelable(): void {
    if (!['PROGRAMADO', 'ASIGNADO'].includes(this.estado)) {
      throw new TransportInvalidStateError(
        this.estado,
        'cancelar',
      );
    }
  }

  private assertInvariants(): void {
    assertPositiveId(this.empresaId, 'empresaId');
    assertPositiveId(this.bodegaId, 'bodegaId');

    if (!['INTERNO', 'EXTERNO'].includes(this.modalidad)) {
      throw new TransportValidationError(
        'La modalidad del envío es inválida.',
      );
    }

    if (!Number.isInteger(this.version) || this.version < 0) {
      throw new TransportValidationError(
        'La versión del envío es inválida.',
      );
    }

    if (
      this.costo !== null &&
      (!Number.isFinite(this.costo) || this.costo < 0)
    ) {
      throw new TransportValidationError(
        'El costo del envío es inválido.',
      );
    }

    if (!this.paradas.length) {
      throw new TransportValidationError(
        'El envío debe contener al menos una parada.',
      );
    }

    const dispatches = new Set<number>();
    const sequences = new Set<number>();

    for (const stop of this.paradas) {
      assertPositiveId(stop.ordenDespachoId, 'ordenDespachoId');
      assertPositiveId(stop.clienteId, 'clienteId');

      if (!Number.isInteger(stop.secuencia) || stop.secuencia <= 0) {
        throw new TransportValidationError(
          'La secuencia de parada es inválida.',
        );
      }

      if (dispatches.has(stop.ordenDespachoId)) {
        throw new TransportValidationError(
          'No se puede repetir un despacho en el mismo envío.',
        );
      }

      if (sequences.has(stop.secuencia)) {
        throw new TransportValidationError(
          'No se puede repetir la secuencia de una parada.',
        );
      }

      dispatches.add(stop.ordenDespachoId);
      sequences.add(stop.secuencia);

      if (!stop.destinatario.trim() || !stop.direccionDestino.trim()) {
        throw new TransportValidationError(
          'El snapshot de destino debe contener destinatario y dirección.',
        );
      }

      if (
        stop.latitudDestino != null &&
        (!Number.isFinite(stop.latitudDestino) ||
          stop.latitudDestino < -90 ||
          stop.latitudDestino > 90)
      ) {
        throw new TransportValidationError(
          'La latitud de destino es inválida.',
        );
      }

      if (
        stop.longitudDestino != null &&
        (!Number.isFinite(stop.longitudDestino) ||
          stop.longitudDestino < -180 ||
          stop.longitudDestino > 180)
      ) {
        throw new TransportValidationError(
          'La longitud de destino es inválida.',
        );
      }

      if (!stop.cargas.length) {
        throw new TransportValidationError(
          'Cada parada debe contener al menos una línea de carga.',
          { ordenDespachoId: stop.ordenDespachoId },
        );
      }

      const detailIds = new Set<number>();

      for (const line of stop.cargas) {
        assertPositiveId(
          line.ordenDespachoDetalleId,
          'ordenDespachoDetalleId',
        );
        assertPositiveId(line.productoId, 'productoId');

        if (detailIds.has(line.ordenDespachoDetalleId)) {
          throw new TransportValidationError(
            'No se puede repetir una línea de despacho en una parada.',
            { ordenDespachoDetalleId: line.ordenDespachoDetalleId },
          );
        }

        detailIds.add(line.ordenDespachoDetalleId);

        const loaded = line.cantidadCargada ?? 0;

        if (
          !Number.isInteger(line.cantidadPlanificada) ||
          line.cantidadPlanificada <= 0 ||
          !Number.isInteger(loaded) ||
          loaded < 0 ||
          loaded > line.cantidadPlanificada
        ) {
          throw new TransportValidationError(
            'Las cantidades de carga son inconsistentes.',
            { ordenDespachoDetalleId: line.ordenDespachoDetalleId },
          );
        }
      }
    }
  }
}

function normalizeText(value?: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function assertPositiveId(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TransportValidationError(
      `El campo ${field} es inválido.`,
      { [field]: value },
    );
  }
}
