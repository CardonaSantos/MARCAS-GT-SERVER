import {
  TransferInvalidStateError,
  TransferValidationError,
} from '../errors/transfer.errors';
import { TransferState } from '../../transfer.types';

export type TransferDetailProps = Readonly<{
  id?: number | null;
  productoId: number;
  cantidadSolicitada: number;
  cantidadEnviada?: number;
  cantidadRecibida?: number;
  observaciones?: string | null;
  version?: number;
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export type TransferProps = Readonly<{
  id?: number | null;
  bodegaOrigenId: number;
  bodegaDestinoId: number;
  creadoPorId: number;
  estado?: TransferState;
  observaciones?: string | null;
  motivoCancelacion?: string | null;
  preparadaEn?: Date | null;
  enviadaEn?: Date | null;
  recibidaEn?: Date | null;
  canceladaEn?: Date | null;
  version?: number;
  detalles?: TransferDetailProps[];
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export class TransferenciaBodega {
  private constructor(private props: TransferProps) {
    this.assertInvariants();
  }

  static create(
    props: Omit<
      TransferProps,
      | 'estado'
      | 'version'
      | 'preparadaEn'
      | 'enviadaEn'
      | 'recibidaEn'
      | 'canceladaEn'
      | 'motivoCancelacion'
    >,
  ): TransferenciaBodega {
    return new TransferenciaBodega({
      ...props,
      estado: 'BORRADOR',
      version: 0,
      detalles: (props.detalles ?? []).map((detail) => ({
        ...detail,
        cantidadEnviada: 0,
        cantidadRecibida: 0,
        version: 0,
      })),
    });
  }

  static rehydrate(props: TransferProps): TransferenciaBodega {
    return new TransferenciaBodega(props);
  }

  get id() { return this.props.id ?? null; }
  get bodegaOrigenId() { return this.props.bodegaOrigenId; }
  get bodegaDestinoId() { return this.props.bodegaDestinoId; }
  get creadoPorId() { return this.props.creadoPorId; }
  get estado() { return this.props.estado ?? 'BORRADOR'; }
  get observaciones() { return this.props.observaciones ?? null; }
  get motivoCancelacion() { return this.props.motivoCancelacion ?? null; }
  get preparadaEn() { return this.props.preparadaEn ?? null; }
  get enviadaEn() { return this.props.enviadaEn ?? null; }
  get recibidaEn() { return this.props.recibidaEn ?? null; }
  get canceladaEn() { return this.props.canceladaEn ?? null; }
  get version() { return this.props.version ?? 0; }
  get detalles() { return this.props.detalles ?? []; }
  get creadoEn() { return this.props.creadoEn ?? new Date(); }
  get actualizadoEn() { return this.props.actualizadoEn ?? new Date(); }

  replaceDraftData(input: {
    bodegaOrigenId?: number;
    bodegaDestinoId?: number;
    observaciones?: string | null;
    detalles?: TransferDetailProps[];
  }): void {
    this.assertState('BORRADOR', 'actualizar');

    this.props = {
      ...this.props,
      ...(input.bodegaOrigenId !== undefined
        ? { bodegaOrigenId: input.bodegaOrigenId }
        : {}),
      ...(input.bodegaDestinoId !== undefined
        ? { bodegaDestinoId: input.bodegaDestinoId }
        : {}),
      ...(input.detalles !== undefined
        ? {
            detalles: input.detalles.map((detail) => ({
              ...detail,
              cantidadEnviada: 0,
              cantidadRecibida: 0,
              version: 0,
            })),
          }
        : {}),
      observaciones:
        input.observaciones === undefined
          ? this.observaciones
          : normalizeText(input.observaciones),
      version: this.version + 1,
    };

    this.assertInvariants();
  }

  prepare(at = new Date()): void {
    this.assertState('BORRADOR', 'preparar');

    if (this.detalles.length === 0) {
      throw new TransferValidationError(
        'La transferencia debe contener al menos un producto.',
      );
    }

    this.props = {
      ...this.props,
      estado: 'PREPARADA',
      preparadaEn: at,
      version: this.version + 1,
    };
  }

  cancel(reason: string, at = new Date()): void {
    if (!['BORRADOR', 'PREPARADA'].includes(this.estado)) {
      throw new TransferInvalidStateError(this.estado, 'cancelar');
    }

    const normalized = normalizeText(reason);
    if (!normalized || normalized.length < 3) {
      throw new TransferValidationError(
        'El motivo de cancelación debe contener al menos 3 caracteres.',
      );
    }

    this.props = {
      ...this.props,
      estado: 'CANCELADA',
      motivoCancelacion: normalized,
      canceladaEn: at,
      version: this.version + 1,
    };
  }

  assertSendable(): void {
    this.assertState('PREPARADA', 'enviar');
  }

  assertReceivable(): void {
    if (!['EN_TRANSITO', 'RECIBIDA_PARCIAL'].includes(this.estado)) {
      throw new TransferInvalidStateError(this.estado, 'recibir');
    }
  }

  private assertState(expected: TransferState, operation: string): void {
    if (this.estado !== expected) {
      throw new TransferInvalidStateError(this.estado, operation);
    }
  }

  private assertInvariants(): void {
    if (
      !Number.isInteger(this.bodegaOrigenId) ||
      this.bodegaOrigenId <= 0 ||
      !Number.isInteger(this.bodegaDestinoId) ||
      this.bodegaDestinoId <= 0
    ) {
      throw new TransferValidationError('Las bodegas de la transferencia son inválidas.');
    }

    if (this.bodegaOrigenId === this.bodegaDestinoId) {
      throw new TransferValidationError(
        'La bodega origen y la bodega destino deben ser diferentes.',
      );
    }

    if (!Number.isInteger(this.creadoPorId) || this.creadoPorId <= 0) {
      throw new TransferValidationError('El creador de la transferencia es inválido.');
    }

    if (!Number.isInteger(this.version) || this.version < 0) {
      throw new TransferValidationError('La versión de la transferencia es inválida.');
    }

    const products = new Set<number>();
    for (const detail of this.detalles) {
      if (!Number.isInteger(detail.productoId) || detail.productoId <= 0) {
        throw new TransferValidationError('El producto de la transferencia es inválido.');
      }
      if (products.has(detail.productoId)) {
        throw new TransferValidationError(
          'No se puede repetir el mismo producto en una transferencia.',
          { productoId: detail.productoId },
        );
      }
      products.add(detail.productoId);

      const sent = detail.cantidadEnviada ?? 0;
      const received = detail.cantidadRecibida ?? 0;
      const version = detail.version ?? 0;

      if (!Number.isInteger(detail.cantidadSolicitada) || detail.cantidadSolicitada <= 0) {
        throw new TransferValidationError(
          'La cantidad solicitada debe ser un entero positivo.',
          { productoId: detail.productoId },
        );
      }
      if (
        !Number.isInteger(sent) ||
        !Number.isInteger(received) ||
        sent < 0 ||
        received < 0 ||
        sent > detail.cantidadSolicitada ||
        received > sent
      ) {
        throw new TransferValidationError(
          'Las cantidades de la transferencia son inconsistentes.',
          { productoId: detail.productoId },
        );
      }
      if (!Number.isInteger(version) || version < 0) {
        throw new TransferValidationError(
          'La versión del detalle de transferencia es inválida.',
          { productoId: detail.productoId },
        );
      }
    }
  }
}

function normalizeText(value?: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}
