import { TrackingSessionStatus } from '../domain/tracking-session.entity';

export type TrackingRealtimeView = {
  tecnico: {
    id: number;
    nombre: string;
    telefono: string | null;
    rol: string;
    avatarUrl: string | null;
  };
  usuario: {
    id: number;
    nombre: string;
    telefono: string | null;
    rol: string;
    avatarUrl: string | null;
  };
  tracking: {
    sesionId: number;
    asistenciaId: number;
    estado: TrackingSessionStatus;
    iniciadoEn: Date;
    ultimoHeartbeatEn: Date;
    minutosSesionActual: number;
  };
  jornada: {
    fecha: Date;
    horaEntrada: Date;
    horaSalida: Date | null;
    sesionesTotal: number;
    sesionesFinalizadas: number;
    sesionesExpiradas: number;
    minutosTracking: number;
    minutosJornadaConfirmados: number;
    minutosSinTrackingConfirmados: number;
  };
  ubicacion: {
    latitud: number;
    longitud: number;
    precision: number | null;
    velocidad: number | null;
    bateria: number | null;
    capturadoEn: Date;
    recibidoEn: Date;
  } | null;
  actividad: {
    ticketsEnProceso: Array<{ id: number; titulo: string | null; estado: string; prioridad: string }>;
    visitasActivas: Array<{ id: number; clienteId: number; inicio: Date; motivoVisita: string | null; tipoVisita: string | null }>;
    enviosActivos: Array<{ id: number; numero: string; estado: string; salidaEn: Date | null; entregaEstimadaEn: Date | null }>;
  };
};

export type TrackingHistoryFilters = {
  page: number;
  limit: number;
  search?: string | null;
  usuarioId?: number | null;
  fechaDesde?: Date | null;
  fechaHasta?: Date | null;
  estadoSesion?: TrackingSessionStatus | null;
};

export interface TrackingQueryPort {
  findRealtimeByUser(usuarioId: number): Promise<TrackingRealtimeView | null>;
  listRealtime(): Promise<TrackingRealtimeView[]>;
  listHistory(filters: TrackingHistoryFilters): Promise<any>;
  getAttendanceDetail(asistenciaId: number): Promise<any | null>;
  listAttendanceLocations(params: {
    asistenciaId: number;
    sesionId?: number | null;
    page: number;
    limit: number;
  }): Promise<any>;
}
