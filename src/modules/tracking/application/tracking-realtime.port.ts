import { TrackingRealtimeView } from './tracking-query.port';
import { TrackingSessionStatus } from '../domain/tracking-session.entity';

export type TrackingStateChangedPayload = {
  usuarioId: number;
  /** Alias conservado por compatibilidad con consumidores del tracking CRM. */
  tecnicoId: number;
  sesionTrackingId: number;
  asistenciaId: number;
  estado: TrackingSessionStatus;
  iniciadoEn: Date;
  finalizadoEn: Date | null;
  ultimoHeartbeatEn: Date;
};

export interface TrackingRealtimePort {
  emitLocationUpdated(payload: TrackingRealtimeView): Promise<void>;
  emitTrackingStateChanged(payload: TrackingStateChangedPayload): Promise<void>;
}
