import { AppRole } from 'src/shared/security/roles.decorator';

export type PaymentMethod =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA_BANCO'
  | 'DEPOSITO'
  | 'CHEQUE'
  | 'OTRO';

export type PaymentState =
  | 'PENDIENTE'
  | 'VERIFICADO'
  | 'RECHAZADO'
  | 'ANULADO';

export type PaymentApplicationState = 'ACTIVA' | 'REVERSADA';

export type PaymentEventType =
  | 'CREADO'
  | 'COMPROBANTE_AGREGADO'
  | 'VERIFICADO'
  | 'RECHAZADO'
  | 'APLICADO'
  | 'APLICACION_REVERTIDA'
  | 'ANULADO'
  | 'OBSERVACION';

export type PaymentActor = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
  empresaId: number | null;
}>;

export type PaymentReadScope = Readonly<{
  empresaId: number;
  rol: AppRole;
  vendedorId?: number;
}>;
