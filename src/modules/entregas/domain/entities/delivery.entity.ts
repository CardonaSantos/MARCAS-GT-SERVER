import {
  DeliveryFailureReason,
  DeliveryState,
} from '../../delivery.types';
import {
  DeliveryInvalidStateError,
  DeliveryValidationError,
} from '../errors/delivery.errors';

export type DeliveryLineSnapshot = Readonly<{
  id?: number;
  ordenDespachoDetalleId: number;
  pedidoDetalleId: number;
  productoId: number;
  cantidadCargada: number;
  cantidadEntregada: number;
  cantidadRechazada: number;
  motivoRechazo?: string | null;
}>;

export type DeliverySnapshot = Readonly<{
  id?: number;
  estado: DeliveryState;
  receptorNombre?: string | null;
  receptorDocumento?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  motivoNoEntrega?: DeliveryFailureReason | null;
  detalleNoEntrega?: string | null;
  version: number;
  detalles: readonly DeliveryLineSnapshot[];
}>;

const TERMINAL: readonly DeliveryState[] = [
  'PARCIAL',
  'ENTREGADA',
  'RECHAZADA',
  'NO_ENTREGADA',
  'CANCELADA',
];

export class Delivery {
  private constructor(private readonly snapshot: DeliverySnapshot) {}

  static restore(snapshot: DeliverySnapshot): Delivery {
    return new Delivery(snapshot);
  }

  assertStartable(): void {
    if (this.snapshot.estado !== 'PENDIENTE') {
      throw new DeliveryInvalidStateError(this.snapshot.estado, 'iniciar');
    }
  }

  assertEditable(): void {
    if (!['PENDIENTE', 'EN_RUTA'].includes(this.snapshot.estado)) {
      throw new DeliveryInvalidStateError(this.snapshot.estado, 'editar el resultado');
    }
  }

  assertEvidenceEditable(): void {
    if (TERMINAL.includes(this.snapshot.estado)) {
      throw new DeliveryInvalidStateError(this.snapshot.estado, 'modificar evidencias');
    }
  }

  validateLineResult(input: {
    cantidadCargada: number;
    cantidadEntregada: number;
    cantidadRechazada: number;
    motivoRechazo?: string | null;
  }): void {
    const values = [
      input.cantidadCargada,
      input.cantidadEntregada,
      input.cantidadRechazada,
    ];
    if (values.some((x) => !Number.isInteger(x) || x < 0)) {
      throw new DeliveryValidationError('Las cantidades de entrega deben ser enteros no negativos.');
    }
    if (input.cantidadEntregada + input.cantidadRechazada > input.cantidadCargada) {
      throw new DeliveryValidationError('La suma entregada/rechazada excede la carga disponible.');
    }
    if (input.cantidadRechazada > 0 && !input.motivoRechazo?.trim()) {
      throw new DeliveryValidationError('Toda cantidad rechazada requiere motivo.');
    }
  }

  validateFinalization(input: {
    resultado: Exclude<DeliveryState, 'PENDIENTE' | 'EN_RUTA' | 'CANCELADA'>;
    receptorNombre?: string | null;
    latitud?: number | null;
    longitud?: number | null;
    motivoNoEntrega?: DeliveryFailureReason | null;
    detalleNoEntrega?: string | null;
    evidencias: { tipo: string }[];
    modalidad: 'INTERNO' | 'EXTERNO';
    lineas: readonly DeliveryLineSnapshot[];
  }): void {
    if (this.snapshot.estado !== 'EN_RUTA') {
      throw new DeliveryInvalidStateError(this.snapshot.estado, 'finalizar');
    }

    input.lineas.forEach((line) => this.validateLineResult(line));

    const entregadas = input.lineas.reduce((a, x) => a + x.cantidadEntregada, 0);
    const rechazadas = input.lineas.reduce((a, x) => a + x.cantidadRechazada, 0);
    const cargadas = input.lineas.reduce((a, x) => a + x.cantidadCargada, 0);

    if (input.modalidad === 'INTERNO') {
      if (input.latitud == null || input.longitud == null) {
        throw new DeliveryValidationError('Una entrega interna requiere ubicación GPS.');
      }
    }

    if (input.resultado === 'ENTREGADA') {
      if (!input.receptorNombre?.trim()) {
        throw new DeliveryValidationError('Una entrega completa requiere nombre del receptor.');
      }
      if (!input.evidencias.some((x) => x.tipo === 'FIRMA' || x.tipo === 'FOTO')) {
        throw new DeliveryValidationError('Una entrega completa requiere firma o fotografía.');
      }
      if (cargadas <= 0 || entregadas !== cargadas || rechazadas !== 0) {
        throw new DeliveryValidationError('ENTREGADA requiere aceptar toda la carga del intento.');
      }
    }

    if (input.resultado === 'PARCIAL') {
      if (!input.receptorNombre?.trim()) {
        throw new DeliveryValidationError('Una entrega parcial requiere nombre del receptor.');
      }
      if (entregadas <= 0 || entregadas >= cargadas) {
        throw new DeliveryValidationError('PARCIAL requiere entregar una parte, no cero ni toda la carga.');
      }
      if (!input.evidencias.length) {
        throw new DeliveryValidationError('Una entrega parcial requiere evidencia.');
      }
    }

    if (input.resultado === 'RECHAZADA') {
      if (entregadas !== 0 || rechazadas <= 0) {
        throw new DeliveryValidationError('RECHAZADA no puede contener unidades aceptadas y debe registrar rechazo.');
      }
    }

    if (input.resultado === 'NO_ENTREGADA') {
      if (entregadas !== 0 || rechazadas !== 0) {
        throw new DeliveryValidationError('NO_ENTREGADA no registra aceptación ni rechazo físico de líneas.');
      }
      if (!input.motivoNoEntrega) {
        throw new DeliveryValidationError('Debe indicar el motivo de no entrega.');
      }
      if (input.motivoNoEntrega === 'OTRO' && !input.detalleNoEntrega?.trim()) {
        throw new DeliveryValidationError('El motivo OTRO requiere detalle.');
      }
    }
  }
}
