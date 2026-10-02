import { AppRole } from 'src/shared/security/roles.decorator';

export type DeliveryState =
  | 'PENDIENTE'
  | 'EN_RUTA'
  | 'PARCIAL'
  | 'ENTREGADA'
  | 'RECHAZADA'
  | 'NO_ENTREGADA'
  | 'CANCELADA';

export type DeliveryFailureReason =
  | 'CLIENTE_AUSENTE'
  | 'DIRECCION_INCORRECTA'
  | 'LOCAL_CERRADO'
  | 'REPROGRAMADA'
  | 'RECHAZO_CLIENTE'
  | 'PROBLEMA_ACCESO'
  | 'DOCUMENTACION'
  | 'MERCADERIA_DANADA'
  | 'OTRO';

export type DeliveryEvidenceType = 'FIRMA' | 'FOTO' | 'DOCUMENTO' | 'OTRO';

export type DeliveryEventType =
  | 'CREADA'
  | 'INICIADA'
  | 'ENTREGA_PARCIAL'
  | 'ENTREGADA'
  | 'RECHAZADA'
  | 'NO_ENTREGADA'
  | 'CANCELADA'
  | 'EVIDENCIA_AGREGADA'
  | 'OBSERVACION';

export type DeliveryActor = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
  empresaId: number | null;
}>;

export type DeliveryAuditDraft = Readonly<{
  actorId?: number | null;
  tipo: DeliveryEventType;
  estado: DeliveryState;
  detalle?: string | null;
  referenciaTipo?: string | null;
  referenciaId?: number | null;
  claveIdempotencia?: string | null;
  metadata?: Record<string, unknown> | null;
}>;
