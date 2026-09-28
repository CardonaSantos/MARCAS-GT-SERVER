import {
  RequisitionInvalidStateError,
  RequisitionValidationError,
} from '../errors/requisition.errors';
import { RequisitionState } from '../requisition.types';

export type RequisitionDetailProps = Readonly<{
  id?: number | null;
  productoId: number;
  cantidadSolicitada: number;
  cantidadRecibida?: number;
  costoUnitarioEstimado?: string | null;
  version?: number;
}>;

export type RequisitionProps = Readonly<{
  id?: number | null;
  empresaId: number;
  bodegaDestinoId: number;
  proveedorId?: number | null;
  solicitanteId: number;
  estado?: RequisitionState;
  observaciones?: string | null;
  solicitadaEn?: Date | null;
  aprobadaEn?: Date | null;
  rechazadaEn?: Date | null;
  canceladaEn?: Date | null;
  completadaEn?: Date | null;
  motivoRechazo?: string | null;
  motivoCancelacion?: string | null;
  version?: number;
  detalles?: RequisitionDetailProps[];
  creadoEn?: Date;
  actualizadoEn?: Date;
}>;

export class Requisition {
  private constructor(private props: RequisitionProps) {
    this.assertInvariants();
  }

  static create(props: Omit<RequisitionProps, 'estado' | 'version'>): Requisition {
    return new Requisition({ ...props, estado: 'BORRADOR', version: 0 });
  }

  static rehydrate(props: RequisitionProps): Requisition {
    return new Requisition(props);
  }

  get id() { return this.props.id ?? null; }
  get empresaId() { return this.props.empresaId; }
  get bodegaDestinoId() { return this.props.bodegaDestinoId; }
  get proveedorId() { return this.props.proveedorId ?? null; }
  get solicitanteId() { return this.props.solicitanteId; }
  get estado() { return this.props.estado ?? 'BORRADOR'; }
  get observaciones() { return this.props.observaciones ?? null; }
  get solicitadaEn() { return this.props.solicitadaEn ?? null; }
  get aprobadaEn() { return this.props.aprobadaEn ?? null; }
  get rechazadaEn() { return this.props.rechazadaEn ?? null; }
  get canceladaEn() { return this.props.canceladaEn ?? null; }
  get completadaEn() { return this.props.completadaEn ?? null; }
  get motivoRechazo() { return this.props.motivoRechazo ?? null; }
  get motivoCancelacion() { return this.props.motivoCancelacion ?? null; }
  get version() { return this.props.version ?? 0; }
  get detalles() { return this.props.detalles ?? []; }
  get creadoEn() { return this.props.creadoEn ?? new Date(); }
  get actualizadoEn() { return this.props.actualizadoEn ?? new Date(); }

  replaceDraftData(input: {
    bodegaDestinoId?: number;
    proveedorId?: number | null;
    observaciones?: string | null;
    detalles?: RequisitionDetailProps[];
  }): void {
    this.assertState('BORRADOR', 'actualizar');
    this.props = {
      ...this.props,
      ...(input.bodegaDestinoId !== undefined
        ? { bodegaDestinoId: input.bodegaDestinoId }
        : {}),
      ...(input.proveedorId !== undefined
        ? { proveedorId: input.proveedorId }
        : {}),
      ...(input.detalles !== undefined ? { detalles: input.detalles } : {}),
      observaciones:
        input.observaciones === undefined
          ? this.observaciones
          : normalizeText(input.observaciones),
      version: this.version + 1,
    };
    this.assertInvariants();
  }

  request(at = new Date()): void {
    this.assertState('BORRADOR', 'solicitar');
    if (this.detalles.length === 0) {
      throw new RequisitionValidationError(
        'La requisición debe contener al menos un producto.',
      );
    }
    this.props = {
      ...this.props,
      estado: 'SOLICITADA',
      solicitadaEn: at,
      version: this.version + 1,
    };
  }

  approve(at = new Date()): void {
    this.assertState('SOLICITADA', 'aprobar');
    if (!this.proveedorId) {
      throw new RequisitionValidationError(
        'La requisición debe tener proveedor antes de aprobarse.',
      );
    }
    this.props = {
      ...this.props,
      estado: 'APROBADA',
      aprobadaEn: at,
      version: this.version + 1,
    };
  }

  reject(reason: string, at = new Date()): void {
    this.assertState('SOLICITADA', 'rechazar');
    const normalized = requireReason(reason);
    this.props = {
      ...this.props,
      estado: 'RECHAZADA',
      motivoRechazo: normalized,
      rechazadaEn: at,
      version: this.version + 1,
    };
  }

  cancel(reason: string, at = new Date()): void {
    if (!['BORRADOR', 'SOLICITADA', 'APROBADA', 'PARCIAL'].includes(this.estado)) {
      throw new RequisitionInvalidStateError(this.estado, 'cancelar');
    }
    const normalized = requireReason(reason);
    this.props = {
      ...this.props,
      estado: 'CANCELADA',
      motivoCancelacion: normalized,
      canceladaEn: at,
      version: this.version + 1,
    };
  }

  assertReceivable(): void {
    if (!['APROBADA', 'PARCIAL'].includes(this.estado)) {
      throw new RequisitionInvalidStateError(this.estado, 'recibir');
    }
    if (!this.proveedorId) {
      throw new RequisitionValidationError(
        'La requisición debe tener proveedor para registrar una recepción.',
      );
    }
  }

  private assertState(expected: RequisitionState, operation: string): void {
    if (this.estado !== expected) {
      throw new RequisitionInvalidStateError(this.estado, operation);
    }
  }

  private assertInvariants(): void {
    if (!Number.isInteger(this.props.empresaId) || this.props.empresaId <= 0) {
      throw new RequisitionValidationError('empresaId inválido.');
    }
    if (!Number.isInteger(this.props.bodegaDestinoId) || this.props.bodegaDestinoId <= 0) {
      throw new RequisitionValidationError('bodegaDestinoId inválido.');
    }
    if (!Number.isInteger(this.props.solicitanteId) || this.props.solicitanteId <= 0) {
      throw new RequisitionValidationError('solicitanteId inválido.');
    }
    if (this.version < 0) {
      throw new RequisitionValidationError('La versión no puede ser negativa.');
    }

    const products = new Set<number>();
    for (const detail of this.detalles) {
      if (!Number.isInteger(detail.productoId) || detail.productoId <= 0) {
        throw new RequisitionValidationError('productoId inválido.');
      }
      if (!Number.isInteger(detail.cantidadSolicitada) || detail.cantidadSolicitada <= 0) {
        throw new RequisitionValidationError(
          'La cantidad solicitada debe ser mayor que cero.',
          { productoId: detail.productoId },
        );
      }
      const received = detail.cantidadRecibida ?? 0;
      if (received < 0 || received > detail.cantidadSolicitada) {
        throw new RequisitionValidationError(
          'La cantidad recibida no es válida.',
          { productoId: detail.productoId },
        );
      }
      if (products.has(detail.productoId)) {
        throw new RequisitionValidationError(
          'Un producto no puede repetirse dentro de la requisición.',
          { productoId: detail.productoId },
        );
      }
      products.add(detail.productoId);
      if (detail.costoUnitarioEstimado != null && Number(detail.costoUnitarioEstimado) < 0) {
        throw new RequisitionValidationError(
          'El costo estimado no puede ser negativo.',
          { productoId: detail.productoId },
        );
      }
    }
  }
}

function normalizeText(value: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function requireReason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3) {
    throw new RequisitionValidationError(
      'El motivo debe contener al menos 3 caracteres.',
    );
  }
  return normalized;
}
