import { TrackingSessionStatus } from '../../domain/tracking-session.entity';

export type TrackingMetricSession = {
  estado: TrackingSessionStatus;
  iniciadaEn: Date;
  finalizadaEn: Date | null;
  ultimoHeartbeatEn: Date;
};

export function calculateConfirmedTrackingMinutes(session: TrackingMetricSession): number {
  const end = session.estado === 'ACTIVA' ? session.ultimoHeartbeatEn : session.finalizadaEn;
  if (!end) return 0;
  return Math.max(0, Math.floor((end.getTime() - session.iniciadaEn.getTime()) / 60_000));
}

export function calculateTotalConfirmedTrackingMinutes(sessions: TrackingMetricSession[]): number {
  return sessions.reduce((total, session) => total + calculateConfirmedTrackingMinutes(session), 0);
}

export function calculateJourneyMinutes(params: { entrada: Date; salida: Date | null }): number | null {
  if (!params.salida) return null;
  return Math.max(0, Math.floor((params.salida.getTime() - params.entrada.getTime()) / 60_000));
}
