import { PrismaClient } from '@prisma/client';
import { getTrackingBusinessDate } from '../../src/modules/tracking/application/helpers/tracking-date.helper';
import { TrackingPrismaRepository } from '../../src/modules/tracking/infrastructure/tracking.prisma-repository';
import { TrackingQueryPrismaAdapter } from '../../src/modules/tracking/infrastructure/tracking-query.prisma-adapter';

function requireLocalTestDatabase(): string {
  const raw = process.env.TEST_DATABASE_URL?.trim();

  if (!raw) {
    throw new Error(
      'TEST_DATABASE_URL es obligatoria para Tracking Integration.',
    );
  }

  const value = raw.replace(/^["']|["']$/g, '');
  const url = new URL(value);
  const allowed = new Set(['localhost', '127.0.0.1', '::1']);

  if (!allowed.has(url.hostname.toLowerCase())) {
    throw new Error(
      'Tracking Integration solo puede ejecutarse contra PostgreSQL local.',
    );
  }

  return value;
}

function createPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: requireLocalTestDatabase(),
      },
    },
  });
}

async function createFixture(prisma: PrismaClient) {
  const tag =
    'tracking-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8);

  const vendedor = await prisma.usuario.create({
    data: {
      nombre: 'Vendedor ' + tag,
      correo: tag + '-vendedor@integration.test',
      contrasena: 'integration-only',
      rol: 'VENDEDOR',
      activo: true,
    },
  });

  const repartidor = await prisma.usuario.create({
    data: {
      nombre: 'Repartidor ' + tag,
      correo: tag + '-repartidor@integration.test',
      contrasena: 'integration-only',
      rol: 'REPARTIDOR',
      activo: true,
    },
  });

  return { tag, vendedor, repartidor };
}

async function cleanupFixture(
  prisma: PrismaClient,
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<void> {
  const userIds = [fixture.vendedor.id, fixture.repartidor.id];

  const sessions = await prisma.sesionTrackingUsuario.findMany({
    where: { usuarioId: { in: userIds } },
    select: { id: true },
  });

  const sessionIds = sessions.map((row) => row.id);

  await prisma.ubicacionUsuarioActual.deleteMany({
    where: { usuarioId: { in: userIds } },
  });

  if (sessionIds.length) {
    await prisma.ubicacionUsuarioHistorial.deleteMany({
      where: { sesionId: { in: sessionIds } },
    });
  }

  await prisma.sesionTrackingUsuario.deleteMany({
    where: { usuarioId: { in: userIds } },
  });

  await prisma.asistencia.deleteMany({
    where: { usuarioId: { in: userIds } },
  });

  await prisma.usuario.deleteMany({
    where: { id: { in: userIds } },
  });
}

describe('Tracking/Jornada / PostgreSQL Integration', () => {
  let prisma: PrismaClient;
  let repository: TrackingPrismaRepository;
  let query: TrackingQueryPrismaAdapter;
  let fixture: Awaited<ReturnType<typeof createFixture>> | null = null;

  beforeAll(async () => {
    prisma = createPrisma();
    await prisma.$connect();
    repository = new TrackingPrismaRepository(prisma as any);
    query = new TrackingQueryPrismaAdapter(prisma as any);
  });

  beforeEach(async () => {
    fixture = await createFixture(prisma);
  });

  afterEach(async () => {
    if (fixture) {
      await cleanupFixture(prisma, fixture);
      fixture = null;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('START concurrente conserva una sola jornada y sesión ACTIVA', async () => {
    const usuarioId = fixture!.vendedor.id;
    const iniciadoEn = new Date('2026-10-05T15:00:00.000Z');
    const fecha = getTrackingBusinessDate(iniciadoEn);

    const [first, second] = await Promise.all([
      repository.startTracking({
        usuarioId,
        fecha,
        iniciadaEn: iniciadoEn,
      }),
      repository.startTracking({
        usuarioId,
        fecha,
        iniciadaEn: iniciadoEn,
      }),
    ]);

    expect(second.asistencia.id).toBe(first.asistencia.id);
    expect(second.sesion.id).toBe(first.sesion.id);

    expect(
      await prisma.asistencia.count({
        where: { usuarioId, fecha },
      }),
    ).toBe(1);

    expect(
      await prisma.sesionTrackingUsuario.count({
        where: { usuarioId, estado: 'ACTIVA' },
      }),
    ).toBe(1);
  });

  it('OFF y reactivación el mismo día reutilizan jornada y crean nueva sesión', async () => {
    const usuarioId = fixture!.vendedor.id;
    const iniciadoEn = new Date('2026-10-05T15:00:00.000Z');
    const fecha = getTrackingBusinessDate(iniciadoEn);

    const first = await repository.startTracking({
      usuarioId,
      fecha,
      iniciadaEn: iniciadoEn,
    });

    const finished = await repository.finishTracking({
      usuarioId,
      sesionId: first.sesion.id,
      finalizadoEn: new Date('2026-10-05T16:00:00.000Z'),
    });

    expect(finished.status).toBe('FINISHED');

    const second = await repository.startTracking({
      usuarioId,
      fecha,
      iniciadaEn: new Date('2026-10-05T17:00:00.000Z'),
    });

    expect(second.asistencia.id).toBe(first.asistencia.id);
    expect(second.sesion.id).not.toBe(first.sesion.id);

    const attendance = await prisma.asistencia.findUniqueOrThrow({
      where: { id: first.asistencia.id },
    });

    expect(attendance.entrada).toEqual(iniciadoEn);
    expect(attendance.salida).toBeNull();

    expect(
      await prisma.sesionTrackingUsuario.count({
        where: { asistenciaId: attendance.id },
      }),
    ).toBe(2);
  });

  it('LOCATION es idempotente y una captura atrasada no retrocede snapshot', async () => {
    const usuarioId = fixture!.repartidor.id;
    const iniciadoEn = new Date('2026-10-05T15:00:00.000Z');

    const started = await repository.startTracking({
      usuarioId,
      fecha: getTrackingBusinessDate(iniciadoEn),
      iniciadaEn: iniciadoEn,
    });

    const key1 = fixture!.tag + ':gps:1';
    const key2 = fixture!.tag + ':gps:2';

    const first = await repository.registerLocation({
      usuarioId,
      sesionId: started.sesion.id,
      claveIdempotencia: key1,
      latitud: 15.66,
      longitud: -91.71,
      precisionM: 5,
      velocidadMps: 1,
      bateriaPct: 80,
      capturadoEn: new Date('2026-10-05T15:10:00.000Z'),
      recibidoEn: new Date('2026-10-05T15:11:00.000Z'),
    });

    const retry = await repository.registerLocation({
      usuarioId,
      sesionId: started.sesion.id,
      claveIdempotencia: key1,
      latitud: 15.66,
      longitud: -91.71,
      precisionM: 5,
      velocidadMps: 1,
      bateriaPct: 80,
      capturadoEn: new Date('2026-10-05T15:10:00.000Z'),
      recibidoEn: new Date('2026-10-05T15:11:30.000Z'),
    });

    const delayed = await repository.registerLocation({
      usuarioId,
      sesionId: started.sesion.id,
      claveIdempotencia: key2,
      latitud: 15.60,
      longitud: -91.70,
      precisionM: 8,
      velocidadMps: 0,
      bateriaPct: 79,
      capturadoEn: new Date('2026-10-05T15:05:00.000Z'),
      recibidoEn: new Date('2026-10-05T15:12:00.000Z'),
    });

    expect(first.applied).toBe(true);
    expect(retry.applied).toBe(true);
    expect(delayed.applied).toBe(true);

    if (first.applied && retry.applied) {
      expect(retry.duplicate).toBe(true);
      expect(retry.ubicacionId).toBe(first.ubicacionId);
    }

    const current = await prisma.ubicacionUsuarioActual.findUniqueOrThrow({
      where: { usuarioId },
    });

    const session = await prisma.sesionTrackingUsuario.findUniqueOrThrow({
      where: { id: started.sesion.id },
    });

    expect(Number(current.latitud)).toBeCloseTo(15.66, 6);
    expect(current.capturadoEn).toEqual(
      new Date('2026-10-05T15:10:00.000Z'),
    );
    expect(session.ultimoHeartbeatEn).toEqual(
      new Date('2026-10-05T15:12:00.000Z'),
    );

    expect(
      await prisma.ubicacionUsuarioHistorial.count({
        where: { sesionId: started.sesion.id },
      }),
    ).toBe(2);
  });

  it('no acepta GPS después de OFF', async () => {
    const usuarioId = fixture!.repartidor.id;
    const iniciadoEn = new Date('2026-10-05T15:00:00.000Z');

    const started = await repository.startTracking({
      usuarioId,
      fecha: getTrackingBusinessDate(iniciadoEn),
      iniciadaEn: iniciadoEn,
    });

    await repository.finishTracking({
      usuarioId,
      sesionId: started.sesion.id,
      finalizadoEn: new Date('2026-10-05T15:30:00.000Z'),
    });

    const late = await repository.registerLocation({
      usuarioId,
      sesionId: started.sesion.id,
      claveIdempotencia: fixture!.tag + ':late',
      latitud: 15.66,
      longitud: -91.71,
      precisionM: 5,
      velocidadMps: 0,
      bateriaPct: 70,
      capturadoEn: new Date('2026-10-05T15:31:00.000Z'),
      recibidoEn: new Date('2026-10-05T15:31:01.000Z'),
    });

    expect(late).toEqual({
      applied: false,
      reason: 'SESSION_NOT_ACTIVE',
    });
  });

  it('EXPIRADA finaliza exactamente en último heartbeat y cierra jornada', async () => {
    const usuarioId = fixture!.vendedor.id;
    const iniciadoEn = new Date('2026-10-05T10:00:00.000Z');

    const started = await repository.startTracking({
      usuarioId,
      fecha: getTrackingBusinessDate(iniciadoEn),
      iniciadaEn: iniciadoEn,
    });

    const heartbeat = started.sesion.ultimoHeartbeatEn;

    expect(
      await repository.expireTracking({
        usuarioId,
        sesionId: started.sesion.id,
        expectedHeartbeatEn: heartbeat,
      }),
    ).toBe(true);

    const session = await prisma.sesionTrackingUsuario.findUniqueOrThrow({
      where: { id: started.sesion.id },
    });

    const attendance = await prisma.asistencia.findUniqueOrThrow({
      where: { id: started.asistencia.id },
    });

    expect(session.estado).toBe('EXPIRADA');
    expect(session.finalizadaEn).toEqual(heartbeat);
    expect(session.ultimoHeartbeatEn).toEqual(heartbeat);
    expect(attendance.salida).toEqual(heartbeat);
  });

  it('PostgreSQL impide dos sesiones ACTIVA para un usuario', async () => {
    const usuarioId = fixture!.vendedor.id;
    const entrada = new Date('2026-10-05T15:00:00.000Z');

    const attendance = await prisma.asistencia.create({
      data: {
        usuarioId,
        fecha: new Date('2026-10-05T00:00:00.000Z'),
        entrada,
      },
    });

    await prisma.sesionTrackingUsuario.create({
      data: {
        usuarioId,
        asistenciaId: attendance.id,
        estado: 'ACTIVA',
        iniciadaEn: entrada,
        ultimoHeartbeatEn: entrada,
      },
    });

    await expect(
      prisma.sesionTrackingUsuario.create({
        data: {
          usuarioId,
          asistenciaId: attendance.id,
          estado: 'ACTIVA',
          iniciadaEn: new Date('2026-10-05T16:00:00.000Z'),
          ultimoHeartbeatEn: new Date('2026-10-05T16:00:00.000Z'),
        },
      }),
    ).rejects.toBeDefined();
  });

  it('read-side arma histórico, detalle y trazado paginado con PostgreSQL real', async () => {
    const usuarioId = fixture!.vendedor.id;
    const entrada = new Date('2026-10-05T15:00:00.000Z');
    const salida = new Date('2026-10-05T16:00:00.000Z');

    const attendance = await prisma.asistencia.create({
      data: {
        usuarioId,
        fecha: new Date('2026-10-05T00:00:00.000Z'),
        entrada,
        salida,
      },
    });

    const session = await prisma.sesionTrackingUsuario.create({
      data: {
        usuarioId,
        asistenciaId: attendance.id,
        estado: 'FINALIZADA',
        iniciadaEn: entrada,
        ultimoHeartbeatEn: new Date('2026-10-05T15:59:00.000Z'),
        finalizadaEn: salida,
        motivoCierre: 'MANUAL',
      },
    });

    await prisma.ubicacionUsuarioHistorial.createMany({
      data: [
        {
          sesionId: session.id,
          claveIdempotencia: fixture!.tag + ':route:1',
          latitud: 15.61,
          longitud: -91.71,
          bateriaPct: 90,
          capturadoEn: new Date('2026-10-05T15:05:00.000Z'),
        },
        {
          sesionId: session.id,
          claveIdempotencia: fixture!.tag + ':route:2',
          latitud: 15.62,
          longitud: -91.72,
          bateriaPct: 80,
          capturadoEn: new Date('2026-10-05T15:30:00.000Z'),
        },
        {
          sesionId: session.id,
          claveIdempotencia: fixture!.tag + ':route:3',
          latitud: 15.63,
          longitud: -91.73,
          bateriaPct: 70,
          capturadoEn: new Date('2026-10-05T15:55:00.000Z'),
        },
      ],
    });

    const history = await query.listHistory({
      page: 1,
      limit: 10,
      usuarioId,
    });

    const detail = await query.getAttendanceDetail(attendance.id);

    const route = await query.listAttendanceLocations({
      asistenciaId: attendance.id,
      page: 1,
      limit: 2,
    });

    expect(history.total).toBe(1);
    expect(history.items[0].asistenciaId).toBe(attendance.id);

    expect(detail.resumen).toEqual(
      expect.objectContaining({
        sesionesTotal: 1,
        sesionesFinalizadas: 1,
        minutosTracking: 60,
        minutosJornada: 60,
        minutosSinTracking: 0,
      }),
    );

    expect(detail.sesiones[0]).toEqual(
      expect.objectContaining({
        id: session.id,
        puntosRegistrados: 3,
        bateriaInicial: 90,
        bateriaFinal: 70,
      }),
    );

    expect(route.total).toBe(3);
    expect(route.items).toHaveLength(2);
    expect(route.items[0].latitud).toBeCloseTo(15.61, 6);
    expect(route.items[1].latitud).toBeCloseTo(15.62, 6);
  });
});
