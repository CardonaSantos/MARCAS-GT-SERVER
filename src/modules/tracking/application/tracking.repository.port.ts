export type TrackingAttendanceRecord = {
  id: number;
  usuarioId: number;
  fecha: Date;
  entrada: Date;
  salida: Date | null;
};

export type TrackingSessionRecord = {
  id: number;
  usuarioId: number;
  asistenciaId: number | null;
  estado: 'ACTIVA' | 'FINALIZADA' | 'EXPIRADA';
  iniciadaEn: Date;
  finalizadaEn: Date | null;
  ultimoHeartbeatEn: Date;
};

export type StartTrackingResult = {
  asistencia: TrackingAttendanceRecord;
  sesion: TrackingSessionRecord;
};

export type RegisterLocationResult =
  | {
      applied: true;
      duplicate: boolean;
      ubicacionId: number;
      capturadoEn: Date;
      recibidoEn: Date;
      sesion: TrackingSessionRecord;
    }
  | {
      applied: false;
      reason: 'SESSION_NOT_ACTIVE' | 'SESSION_NOT_FOUND' | 'IDEMPOTENCY_COLLISION';
    };

export type FinishTrackingResult =
  | {
      status: 'FINISHED' | 'ALREADY_FINISHED';
      asistencia: TrackingAttendanceRecord;
      sesion: TrackingSessionRecord;
    }
  | { status: 'EXPIRED' | 'NOT_FOUND' | 'RACE_LOST' };

export type StaleTrackingSession = {
  id: number;
  usuarioId: number;
  asistenciaId: number | null;
  iniciadaEn: Date;
  ultimoHeartbeatEn: Date;
};

export interface TrackingRepositoryPort {
  findActiveSessionByUser(usuarioId: number): Promise<TrackingSessionRecord | null>;
  startTracking(params: { usuarioId: number; fecha: Date; iniciadaEn: Date }): Promise<StartTrackingResult>;
  registerLocation(params: {
    usuarioId: number;
    sesionId: number;
    claveIdempotencia: string;
    latitud: number;
    longitud: number;
    precisionM: number | null;
    velocidadMps: number | null;
    bateriaPct: number | null;
    capturadoEn: Date;
    recibidoEn: Date;
  }): Promise<RegisterLocationResult>;
  finishTracking(params: { usuarioId: number; sesionId: number; finalizadoEn: Date }): Promise<FinishTrackingResult>;
  findStaleActiveSessions(params: { before: Date; limit: number }): Promise<StaleTrackingSession[]>;
  expireTracking(params: { usuarioId: number; sesionId: number; expectedHeartbeatEn: Date }): Promise<boolean>;
}
