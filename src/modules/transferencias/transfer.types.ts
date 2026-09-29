import { AppRole } from 'src/shared/security/roles.decorator';

export type TransferState =
  | 'BORRADOR'
  | 'PREPARADA'
  | 'EN_TRANSITO'
  | 'RECIBIDA_PARCIAL'
  | 'RECIBIDA'
  | 'CANCELADA';

export type TransferOperationType = 'SALIDA' | 'RECEPCION';

export type TransferOperationState = 'PENDIENTE' | 'APLICADA' | 'FALLIDA';

export type TransferEventType =
  | 'CREADA'
  | 'ACTUALIZADA'
  | 'PREPARADA'
  | 'SALIDA_REGISTRADA'
  | 'RECEPCION_REGISTRADA'
  | 'RECIBIDA_PARCIAL'
  | 'RECIBIDA'
  | 'CANCELADA'
  | 'OPERACION_FALLIDA'
  | 'OBSERVACION';

export type TransferAuditDraft = Readonly<{
  actorId?: number | null;
  type: TransferEventType;
  detail?: string | null;
}>;

export type TransferActorEntry = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
  empresaId: number | null;
}>;
