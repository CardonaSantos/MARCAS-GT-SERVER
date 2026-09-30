import { AppRole } from 'src/shared/security/roles.decorator';

export type CreditApplicationState = 'PENDIENTE' | 'EN_REVISION' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
export type CreditReferenceType = 'PERSONAL' | 'COMERCIAL' | 'LABORAL' | 'OTRA';
export type CreditReferenceResult = 'PENDIENTE' | 'VERIFICADA' | 'NO_VERIFICADA' | 'RECHAZADA';
export type CreditDocumentType = 'DPI' | 'NIT' | 'ESTADO_CUENTA' | 'CONSTANCIA_INGRESOS' | 'PATENTE' | 'OTRO';
export type CreditDocumentState = 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO';
export type CreditRequirementState = 'PENDIENTE' | 'CUMPLIDO' | 'NO_CUMPLE' | 'EXONERADO';
export type CreditDecisionType = 'APROBADA' | 'RECHAZADA' | 'AJUSTADA';
export type CreditIntegrationType = 'APROBACION' | 'RECHAZO';
export type CreditIntegrationState = 'PENDIENTE' | 'APLICADA' | 'FALLIDA';
export type CreditEventType =
  | 'CREADA' | 'ACTUALIZADA' | 'ENVIADA_REVISION'
  | 'REFERENCIA_AGREGADA' | 'REFERENCIA_ACTUALIZADA' | 'REFERENCIA_VERIFICADA'
  | 'DOCUMENTO_AGREGADO' | 'DOCUMENTO_VALIDADO' | 'DOCUMENTO_RECHAZADO'
  | 'REQUISITO_ACTUALIZADO' | 'APROBADA' | 'APROBADA_AJUSTADA' | 'RECHAZADA'
  | 'CANCELADA' | 'CREDITO_CREADO' | 'INTEGRACION_PEDIDO_APLICADA'
  | 'INTEGRACION_PEDIDO_FALLIDA' | 'OBSERVACION';

export type CreditActorEntry = Readonly<{
  id: number; nombre: string; correo: string; rol: AppRole; activo: boolean; empresaId: number | null;
}>;

export type CreditAuditDraft = Readonly<{
  actorId?: number | null;
  tipo: CreditEventType;
  detalle?: string | null;
  referencia?: Readonly<{ tipo: string; id: number }> | null;
}>;
