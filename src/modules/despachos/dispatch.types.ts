import { AppRole } from 'src/shared/security/roles.decorator';

export type DispatchState =
  | 'PENDIENTE'
  | 'PREPARANDO'
  | 'PREPARADA'
  | 'PARCIALMENTE_DESPACHADA'
  | 'DESPACHADA'
  | 'CANCELADA';

export type DispatchOperationType =
  | 'RESERVA_PREPARACION'
  | 'SALIDA_DESPACHO'
  | 'LIBERACION_RESERVA';

export type DispatchOperationState =
  | 'PENDIENTE'
  | 'APLICANDO'
  | 'APLICADA'
  | 'FALLIDA';

export type DispatchOperationLineState =
  | 'PENDIENTE'
  | 'APLICADA'
  | 'FALLIDA';

export type DispatchEventType =
  | 'CREADA'
  | 'ACTUALIZADA'
  | 'PREPARACION_INICIADA'
  | 'PREPARACION_AJUSTADA'
  | 'PREPARADA'
  | 'DESPACHO_PARCIAL'
  | 'DESPACHADA'
  | 'CANCELADA'
  | 'OPERACION_FALLIDA'
  | 'OPERACION_REINTENTADA'
  | 'OBSERVACION';

export type DispatchActorEntry = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
  empresaId: number | null;
}>;

export type DispatchReference = Readonly<{
  tipo: string;
  id: number;
}>;

export type DispatchAuditDraft = Readonly<{
  actorId?: number | null;
  tipo: DispatchEventType;
  detalle?: string | null;
  referencia?: DispatchReference | null;
  metadata?: Record<string, unknown> | null;
  claveIdempotencia?: string | null;
}>;
