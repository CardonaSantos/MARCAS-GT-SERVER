import { TrackingSessionEntity } from './tracking-session.entity';

describe('TrackingSessionEntity', () => {
  const startedAt = new Date('2026-10-05T14:00:00.000Z');

  it('inicia ACTIVA con heartbeat igual al inicio', () => {
    const session = TrackingSessionEntity.start({
      usuarioId: 7,
      asistenciaId: 11,
      iniciadaEn: startedAt,
    });

    expect(session.estado).toBe('ACTIVA');
    expect(session.finalizadaEn).toBeNull();
    expect(session.ultimoHeartbeatEn).toEqual(startedAt);
  });

  it('mantiene el heartbeat monotónico ante reintentos atrasados', () => {
    const session = TrackingSessionEntity.start({
      usuarioId: 7,
      asistenciaId: 11,
      iniciadaEn: startedAt,
    });

    const newer = new Date('2026-10-05T14:05:00.000Z');

    session.registrarHeartbeat(newer);
    session.registrarHeartbeat(new Date('2026-10-05T14:03:00.000Z'));

    expect(session.ultimoHeartbeatEn).toEqual(newer);
  });

  it('finaliza de forma idempotente', () => {
    const session = TrackingSessionEntity.start({
      usuarioId: 7,
      asistenciaId: 11,
      iniciadaEn: startedAt,
    });
    const finishedAt = new Date('2026-10-05T15:00:00.000Z');

    session.finalizar(finishedAt);
    session.finalizar(new Date('2026-10-05T16:00:00.000Z'));

    expect(session.estado).toBe('FINALIZADA');
    expect(session.finalizadaEn).toEqual(finishedAt);
  });

  it('expira exactamente en el último heartbeat', () => {
    const session = TrackingSessionEntity.start({
      usuarioId: 7,
      asistenciaId: 11,
      iniciadaEn: startedAt,
    });
    const heartbeat = new Date('2026-10-05T14:40:00.000Z');

    session.registrarHeartbeat(heartbeat);
    session.expirar();

    expect(session.estado).toBe('EXPIRADA');
    expect(session.finalizadaEn).toEqual(heartbeat);
    expect(session.finalizadaEn).toEqual(session.ultimoHeartbeatEn);
  });

  it('no permite finalizar manualmente una sesión expirada', () => {
    const session = TrackingSessionEntity.start({
      usuarioId: 7,
      asistenciaId: 11,
      iniciadaEn: startedAt,
    });

    session.expirar();

    expect(() =>
      session.finalizar(new Date('2026-10-05T15:00:00.000Z')),
    ).toThrow('Una sesión EXPIRADA no puede finalizarse manualmente.');
  });
});
