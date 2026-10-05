import {
  FinishTrackingUseCase,
  RegisterTrackingLocationUseCase,
  StartTrackingUseCase,
} from './tracking.use-cases';

describe('Tracking use cases - contrato APK', () => {
  const repository = {
    findActiveSessionByUser: jest.fn(),
    startTracking: jest.fn(),
    registerLocation: jest.fn(),
    finishTracking: jest.fn(),
    findStaleActiveSessions: jest.fn(),
    expireTracking: jest.fn(),
  } as any;

  const query = {
    findRealtimeByUser: jest.fn(),
  } as any;

  const realtime = {
    emitLocationUpdated: jest.fn(),
    emitTrackingStateChanged: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('START es idempotente cuando ya existe una sesión ACTIVA', async () => {
    const active = {
      id: 31,
      usuarioId: 7,
      asistenciaId: 80,
      estado: 'ACTIVA',
      iniciadaEn: new Date('2026-10-05T14:00:00.000Z'),
      finalizadaEn: null,
      ultimoHeartbeatEn: new Date('2026-10-05T14:10:00.000Z'),
    };

    repository.findActiveSessionByUser.mockResolvedValue(active);

    const useCase = new StartTrackingUseCase(repository, realtime);
    const result = await useCase.execute(7);

    expect(result).toEqual({
      sesionTrackingId: 31,
      asistenciaId: 80,
      estado: 'ACTIVA',
      iniciadoEn: active.iniciadaEn,
      ultimoHeartbeatEn: active.ultimoHeartbeatEn,
    });
    expect(repository.startTracking).not.toHaveBeenCalled();
  });

  it('LOCATION mantiene compatibilidad con la APK actual sin clave explícita', async () => {
    repository.registerLocation.mockImplementation(async (input: any) => ({
      applied: true,
      duplicate: false,
      ubicacionId: 501,
      capturadoEn: input.capturadoEn,
      recibidoEn: input.recibidoEn,
      sesion: {
        id: 31,
        usuarioId: 7,
        asistenciaId: 80,
        estado: 'ACTIVA',
        iniciadaEn: new Date('2026-10-05T14:00:00.000Z'),
        finalizadaEn: null,
        ultimoHeartbeatEn: input.recibidoEn,
      },
    }));

    query.findRealtimeByUser.mockResolvedValue(null);

    const useCase = new RegisterTrackingLocationUseCase(
      repository,
      query,
      realtime,
    );

    const command = {
      usuarioId: 7,
      sesionTrackingId: 31,
      latitud: 15.66,
      longitud: -91.71,
      precision: 5,
      velocidad: 1,
      bateria: 70,
      capturadoEn: '2026-10-05T14:15:00.000Z',
    };

    await useCase.execute(command);
    const firstKey =
      repository.registerLocation.mock.calls[0][0].claveIdempotencia;

    await useCase.execute(command);
    const secondKey =
      repository.registerLocation.mock.calls[1][0].claveIdempotencia;

    expect(firstKey).toMatch(/^apk-auto:[a-f0-9]{64}$/);
    expect(secondKey).toBe(firstKey);
  });

  it('FINISH conserva el instante de la sesión en un retry tras reabrir jornada', async () => {
    const finalizadoEn = new Date('2026-10-05T15:00:00.000Z');

    repository.finishTracking.mockResolvedValue({
      status: 'ALREADY_FINISHED',
      asistencia: {
        id: 80,
        usuarioId: 7,
        fecha: new Date('2026-10-05T00:00:00.000Z'),
        entrada: new Date('2026-10-05T14:00:00.000Z'),
        salida: null,
      },
      sesion: {
        id: 31,
        usuarioId: 7,
        asistenciaId: 80,
        estado: 'FINALIZADA',
        iniciadaEn: new Date('2026-10-05T14:00:00.000Z'),
        finalizadaEn,
        ultimoHeartbeatEn: new Date('2026-10-05T14:59:00.000Z'),
      },
    });

    const useCase = new FinishTrackingUseCase(repository, realtime);
    const result = await useCase.execute(7, 31);

    expect(result.estado).toBe('FINALIZADA');
    expect(result.horaSalida).toEqual(finalizadoEn);
    expect(realtime.emitTrackingStateChanged).not.toHaveBeenCalled();
  });
});
