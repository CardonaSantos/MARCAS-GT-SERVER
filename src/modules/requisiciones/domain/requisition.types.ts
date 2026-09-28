export type RequisitionState =
  | 'BORRADOR'
  | 'SOLICITADA'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'PARCIAL'
  | 'COMPLETADA'
  | 'CANCELADA';

export type RequisitionEventType =
  | 'CREADA'
  | 'ACTUALIZADA'
  | 'SOLICITADA'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'RECEPCION_REGISTRADA'
  | 'COMPLETADA'
  | 'CANCELADA'
  | 'OBSERVACION';

export type RequisitionReceiptState = 'PENDIENTE' | 'APLICADA' | 'FALLIDA';

export type RequisitionAuditDraft = Readonly<{
  actorId?: number | null;
  type: RequisitionEventType;
  detail?: string | null;
}>;
