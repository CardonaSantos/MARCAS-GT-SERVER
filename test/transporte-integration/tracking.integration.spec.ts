import { PrismaClient } from '@prisma/client';
import { TrackingDirectoryPrismaAdapter } from '../../src/modules/tracking/infrastructure/tracking-directory.prisma-adapter';
import { createIntegrationPrisma } from './integration-db';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
  TransportIntegrationFixture,
} from './transport-fixture';

describe('Tracking directory / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: TransportIntegrationFixture | null = null;
  let tracking: TrackingDirectoryPrismaAdapter;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();
    tracking = new TrackingDirectoryPrismaAdapter(prisma as any);
  });

  beforeEach(async () => {
    fixture = await createTransportIntegrationFixture(prisma);
  });

  afterEach(async () => {
    if (fixture) {
      await cleanupTransportIntegrationFixture(prisma, fixture);
      fixture = null;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('getCurrent lee sesión activa y ubicación actual real', async () => {
    const f = fixture!;
    const capturedAt = new Date();

    const session = await prisma.sesionTrackingUsuario.create({
      data: {
        usuarioId: f.repartidor.id,
        estado: 'ACTIVA',
        dispositivoId: `device-${f.tag}`,
        plataforma: 'android',
      },
    });

    await prisma.ubicacionUsuarioActual.create({
      data: {
        sesionId: session.id,
        usuarioId: f.repartidor.id,
        latitud: 15.6666667,
        longitud: -91.7111111,
        precisionM: 5.5,
        velocidadMps: 2.25,
        bateriaPct: 80,
        capturadoEn: capturedAt,
      },
    });

    const result = await tracking.getCurrent(f.repartidor.id);

    expect(result.usuarioId).toBe(f.repartidor.id);
    expect(result.sesionId).toBe(session.id);
    expect(result.sesionActiva).toBe(true);
    expect(result.latitud).toBeCloseTo(15.6666667, 6);
    expect(result.longitud).toBeCloseTo(-91.7111111, 6);
    expect(result.precisionM).toBe(5.5);
    expect(result.velocidadMps).toBe(2.25);
    expect(result.bateriaPct).toBe(80);
  });

  it('listHistory pagina ubicaciones de todas las sesiones del usuario', async () => {
    const f = fixture!;

    const session = await prisma.sesionTrackingUsuario.create({
      data: {
        usuarioId: f.repartidor.id,
        estado: 'ACTIVA',
      },
    });

    const base = new Date('2026-10-01T12:00:00.000Z');

    await prisma.ubicacionUsuarioHistorial.createMany({
      data: [
        {
          sesionId: session.id,
          claveIdempotencia: f.tag + ':transport-history:1',
          latitud: 15.1,
          longitud: -91.1,
          capturadoEn: base,
          bateriaPct: 90,
        },
        {
          sesionId: session.id,
          claveIdempotencia: f.tag + ':transport-history:2',
          latitud: 15.2,
          longitud: -91.2,
          capturadoEn: new Date(base.getTime() + 60_000),
          bateriaPct: 89,
        },
        {
          sesionId: session.id,
          claveIdempotencia: f.tag + ':transport-history:3',
          latitud: 15.3,
          longitud: -91.3,
          capturadoEn: new Date(base.getTime() + 120_000),
          bateriaPct: 88,
        },
      ],
    });

    const result = await tracking.listHistory(
      f.repartidor.id,
      {
        desde: new Date(base.getTime() - 1_000),
        hasta: new Date(base.getTime() + 180_000),
        page: 1,
        limit: 2,
      },
    );

    expect(result.meta).toEqual({
      total: 3,
      page: 1,
      limit: 2,
      totalPages: 2,
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].latitud).toBeCloseTo(15.3, 6);
    expect(result.data[1].latitud).toBeCloseTo(15.2, 6);
  });
});
