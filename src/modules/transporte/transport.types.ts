export type TransportRole =
  | 'ADMIN'
  | 'VENDEDOR'
  | 'BODEGA'
  | 'CONTABILIDAD'
  | 'REPARTIDOR';
export type ShipmentMode = 'INTERNO' | 'EXTERNO';
export type ShipmentState =
  | 'PROGRAMADO'
  | 'ASIGNADO'
  | 'CARGADO'
  | 'EN_RUTA'
  | 'ENTREGADO_PARCIAL'
  | 'COMPLETADO'
  | 'INCIDENCIA'
  | 'CANCELADO';
export type StopState =
  | 'PENDIENTE'
  | 'EN_RUTA'
  | 'ATENDIDA'
  | 'INCIDENCIA'
  | 'CANCELADA';
export type VehicleState =
  | 'DISPONIBLE'
  | 'RESERVADO'
  | 'EN_RUTA'
  | 'MANTENIMIENTO'
  | 'FUERA_SERVICIO'
  | 'INACTIVO';
export type DriverState = 'DISPONIBLE' | 'ASIGNADO' | 'EN_RUTA' | 'INACTIVO';
export type ShipmentIncidentType =
  | 'AVERIA'
  | 'ACCIDENTE'
  | 'TRAFICO'
  | 'BLOQUEO_RUTA'
  | 'SEGURIDAD'
  | 'DOCUMENTACION'
  | 'CLIENTE_NO_DISPONIBLE'
  | 'DIRECCION_INCORRECTA'
  | 'MERCADERIA'
  | 'OTRO';
export type ShipmentIncidentSeverity = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type ShipmentIncidentState = 'ABIERTA' | 'EN_ATENCION' | 'RESUELTA';
export type TransportActor = Readonly<{
  id: number;
  nombre: string;
  correo: string;
  rol: TransportRole;
  activo: boolean;
  empresaId: number | null;
}>;
