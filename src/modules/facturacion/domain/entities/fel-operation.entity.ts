import { FelOperationState, FelOperationType } from '../../billing.types';
import {
  BillingInvalidStateError,
  BillingValidationError,
} from '../errors/billing.errors';

export type FelOperationProps = Readonly<{
  id?: number | null;
  documentoFiscalId: number;
  proveedorFelConfigId: number;
  tipo: FelOperationType;
  estado?: FelOperationState;
  intentos?: number;
  maxIntentos?: number;
  version?: number;
}>;

export class FelOperation {
  private constructor(private props: FelOperationProps) {
    if (this.props.documentoFiscalId <= 0 || this.props.proveedorFelConfigId <= 0) {
      throw new BillingValidationError('La operación FEL tiene referencias inválidas.');
    }
    if (this.intentos < 0 || this.maxIntentos <= 0 || this.version < 0) {
      throw new BillingValidationError('Los contadores de la operación FEL son inválidos.');
    }
  }

  static create(props: Omit<FelOperationProps, 'estado' | 'intentos' | 'version'>): FelOperation {
    return new FelOperation({ ...props, estado: 'PENDIENTE', intentos: 0, version: 0 });
  }

  static rehydrate(props: FelOperationProps): FelOperation {
    return new FelOperation(props);
  }

  get estado() { return this.props.estado ?? 'PENDIENTE'; }
  get intentos() { return this.props.intentos ?? 0; }
  get maxIntentos() { return this.props.maxIntentos ?? 5; }
  get version() { return this.props.version ?? 0; }

  start(): void {
    if (!['PENDIENTE', 'REINTENTABLE', 'INCIERTA'].includes(this.estado)) {
      throw new BillingInvalidStateError(this.estado, 'iniciar operación FEL');
    }
    this.props = {
      ...this.props,
      estado: 'EJECUTANDO',
      intentos: this.intentos + 1,
      version: this.version + 1,
    };
  }

  markRetryable(): void {
    this.assertExecuting();
    this.props = { ...this.props, estado: 'REINTENTABLE', version: this.version + 1 };
  }

  markUncertain(): void {
    this.assertExecuting();
    this.props = { ...this.props, estado: 'INCIERTA', version: this.version + 1 };
  }

  markRejected(): void {
    this.assertExecuting();
    this.props = { ...this.props, estado: 'RECHAZADA', version: this.version + 1 };
  }

  markSuccess(): void {
    this.assertExecuting();
    this.props = { ...this.props, estado: 'EXITOSA', version: this.version + 1 };
  }

  private assertExecuting(): void {
    if (this.estado !== 'EJECUTANDO') {
      throw new BillingInvalidStateError(this.estado, 'finalizar operación FEL');
    }
  }
}
