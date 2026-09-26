export type BodegaEventType =
  | 'CREADA'
  | 'ACTUALIZADA'
  | 'ACTIVADA'
  | 'DESACTIVADA'
  | 'RESPONSABLE_ASIGNADO'
  | 'RESPONSABLE_REMOVIDO'
  | 'ESTABLECIDA_PRINCIPAL';

export type BodegaUserRole =
  | 'ADMIN'
  | 'VENDEDOR'
  | 'BODEGA'
  | 'CONTABILIDAD'
  | 'REPARTIDOR';

export type BodegaAuditDraft = Readonly<{
  actorId?: number | null;
  type: BodegaEventType;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
}>;

export type BodegaUserSnapshot = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: BodegaUserRole;
  activo: boolean;
}>;

export type BodegaOperationalDependencies = Readonly<{
  stockReal: number;
  stockReservado: number;
  requisicionesPendientes: number;
  transferenciasPendientes: number;
  despachosPendientes: number;
  enviosPendientes: number;
}>;

export const hasBlockingBodegaDependencies = (
  dependencies: BodegaOperationalDependencies,
): boolean =>
  dependencies.stockReal > 0 ||
  dependencies.stockReservado > 0 ||
  dependencies.requisicionesPendientes > 0 ||
  dependencies.transferenciasPendientes > 0 ||
  dependencies.despachosPendientes > 0 ||
  dependencies.enviosPendientes > 0;
