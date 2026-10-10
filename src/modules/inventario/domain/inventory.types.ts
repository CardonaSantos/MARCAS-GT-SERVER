export type InventoryUserRole =
  | 'ADMIN'
  | 'BODEGA'
  | 'CONTABILIDAD'
  | 'VENDEDOR'
  | 'REPARTIDOR';

export type InventoryMovementType =
  | 'MIGRACION_INICIAL'
  | 'ENTRADA_RECEPCION'
  | 'SALIDA_DESPACHO'
  | 'RESERVA'
  | 'LIBERACION_RESERVA'
  | 'AJUSTE_ENTRADA'
  | 'AJUSTE_SALIDA'
  | 'TRANSFERENCIA_SALIDA'
  | 'TRANSFERENCIA_ENTRADA'
  | 'DEVOLUCION';

export type InventoryReservationState =
  | 'ACTIVA'
  | 'PARCIAL'
  | 'APLICADA'
  | 'LIBERADA'
  | 'CANCELADA'
  | 'FINALIZADA_MIXTA';

export type InventoryOrderState =
  | 'BORRADOR'
  | 'PENDIENTE_VALIDACION'
  | 'CONFIRMADO'
  | 'EN_PREPARACION'
  | 'PARCIALMENTE_DESPACHADO'
  | 'DESPACHADO'
  | 'PARCIALMENTE_ENTREGADO'
  | 'ENTREGADO'
  | 'CANCELADO';

export type InventoryOrderEventType =
  | 'RESERVA_CREADA'
  | 'RESERVA_LIBERADA';

export type InventoryReference = Readonly<{
  type: string;
  id: number;
}>;

export type InventoryOrderEventDraft = Readonly<{
  pedidoId: number;
  actorId: number;
  tipo: InventoryOrderEventType;
  detalle: string;
  referencia?: InventoryReference | null;
}>;

export type StockSnapshot = Readonly<{
  cantidadReal: number;
  cantidadReservada: number;
  cantidadDisponible: number;
  costoPromedio: string;
}>;

export type InventoryUserEntry = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: InventoryUserRole;
  activo: boolean;
}>;

export type ProductCatalogEntry = Readonly<{
  id: number;
  codigo: string;
  nombre: string;
}>;

export type OrderDetailInventoryContext = Readonly<{
  id: number;
  pedidoId: number;
  pedidoEstado: InventoryOrderState;
  productoId: number;
  cantidadSolicitada: number;
  cantidadReservada: number;
  cantidadDespachada: number;
}>;
