import { AppRole } from 'src/shared/security/roles.decorator';

export type OrderState =
  | 'BORRADOR'
  | 'PENDIENTE_VALIDACION'
  | 'CONFIRMADO'
  | 'EN_PREPARACION'
  | 'PARCIALMENTE_DESPACHADO'
  | 'DESPACHADO'
  | 'PARCIALMENTE_ENTREGADO'
  | 'ENTREGADO'
  | 'CANCELADO';

export type OrderPaymentCondition =
  | 'PREPAGO'
  | 'CONTRAENTREGA'
  | 'CREDITO'
  | 'MIXTO';

export type OrderPaymentState =
  | 'PENDIENTE'
  | 'PARCIAL'
  | 'PAGADO'
  | 'REEMBOLSADO'
  | 'ANULADO';

export type OrderEventType =
  | 'CREADO'
  | 'ACTUALIZADO'
  | 'VALIDACION_SOLICITADA'
  | 'CONFIRMADO'
  | 'CREDITO_APROBADO'
  | 'CREDITO_RECHAZADO'
  | 'RESERVA_CREADA'
  | 'RESERVA_LIBERADA'
  | 'PREPARACION_INICIADA'
  | 'DESPACHO_PARCIAL'
  | 'DESPACHADO'
  | 'ENTREGA_PARCIAL'
  | 'ENTREGADO'
  | 'CANCELADO'
  | 'OBSERVACION';

export type OrderActorEntry = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: AppRole;
  activo: boolean;
  empresaId: number | null;
}>;

export type OrderAuditDraft = Readonly<{
  actorId: number;
  tipo: OrderEventType;
  detalle?: string | null;
  referencia?: Readonly<{
    tipo: string;
    id: number;
  }> | null;
}>;
