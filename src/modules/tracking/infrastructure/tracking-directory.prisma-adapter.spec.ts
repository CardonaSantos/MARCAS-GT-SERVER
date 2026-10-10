import { TrackingDirectoryPrismaAdapter } from './tracking-directory.prisma-adapter';

describe('TrackingDirectoryPrismaAdapter', () => {
  const prisma = {
    sesionTrackingUsuario: {
      findFirst: jest.fn(),
    },
    ubicacionUsuarioActual: {
      findUnique: jest.fn(),
    },
    ubicacionUsuarioHistorial: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  } as any;

  const adapter = new TrackingDirectoryPrismaAdapter(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrent', () => {
    it('devuelve la ubicación cuando pertenece a la sesión ACTIVA', async () => {
      const heartbeat = new Date('2026-10-05T16:00:00.000Z');
      const capturedAt = new Date('2026-10-05T15:59:45.000Z');

      prisma.sesionTrackingUsuario.findFirst.mockResolvedValue({
        id: 55,
        ultimoHeartbeatEn: heartbeat,
      });
      prisma.ubicacionUsuarioActual.findUnique.mockResolvedValue({
        sesionId: 55,
        latitud: 15.6666667,
        longitud: -91.7111111,
        precisionM: 6.5,
        velocidadMps: 2.25,
        bateriaPct: 78,
        capturadoEn: capturedAt,
      });

      await expect(adapter.getCurrent(7)).resolves.toEqual({
        usuarioId: 7,
        sesionId: 55,
        sesionActiva: true,
        ultimoHeartbeatEn: heartbeat,
        latitud: 15.6666667,
        longitud: -91.7111111,
        precisionM: 6.5,
        velocidadMps: 2.25,
        bateriaPct: 78,
        capturadoEn: capturedAt,
      });
    });

    it('no mezcla la última ubicación de una sesión vieja con una sesión nueva', async () => {
      prisma.sesionTrackingUsuario.findFirst.mockResolvedValue({
        id: 20,
        ultimoHeartbeatEn: new Date('2026-10-05T16:00:00.000Z'),
      });
      prisma.ubicacionUsuarioActual.findUnique.mockResolvedValue({
        sesionId: 10,
        latitud: 15.5,
        longitud: -91.5,
        precisionM: 4,
        velocidadMps: 0,
        bateriaPct: 80,
        capturadoEn: new Date('2026-10-05T12:00:00.000Z'),
      });

      const result = await adapter.getCurrent(3);

      expect(result.sesionActiva).toBe(true);
      expect(result.sesionId).toBe(20);
      expect(result.latitud).toBeNull();
      expect(result.longitud).toBeNull();
      expect(result.precisionM).toBeNull();
      expect(result.velocidadMps).toBeNull();
      expect(result.bateriaPct).toBeNull();
      expect(result.capturadoEn).toBeNull();
    });

    it('convierte valores Decimal-like a number', async () => {
      prisma.sesionTrackingUsuario.findFirst.mockResolvedValue({
        id: 10,
        ultimoHeartbeatEn: new Date('2026-10-05T16:00:00.000Z'),
      });
      prisma.ubicacionUsuarioActual.findUnique.mockResolvedValue({
        sesionId: 10,
        latitud: { valueOf: () => 15.5 },
        longitud: { valueOf: () => -91.5 },
        precisionM: { valueOf: () => 4.25 },
        velocidadMps: { valueOf: () => 1.75 },
        bateriaPct: 60,
        capturadoEn: new Date('2026-10-05T16:00:00.000Z'),
      });

      const result = await adapter.getCurrent(3);

      expect(result.latitud).toBe(15.5);
      expect(result.longitud).toBe(-91.5);
      expect(result.precisionM).toBe(4.25);
      expect(result.velocidadMps).toBe(1.75);
    });

    it('devuelve snapshot vacío cuando no existe sesión activa', async () => {
      prisma.sesionTrackingUsuario.findFirst.mockResolvedValue(null);
      prisma.ubicacionUsuarioActual.findUnique.mockResolvedValue({
        sesionId: 8,
        latitud: 15.5,
        longitud: -91.5,
        precisionM: 5,
        velocidadMps: 0,
        bateriaPct: 50,
        capturadoEn: new Date('2026-10-04T16:00:00.000Z'),
      });

      await expect(adapter.getCurrent(99)).resolves.toEqual({
        usuarioId: 99,
        sesionId: null,
        sesionActiva: false,
        ultimoHeartbeatEn: null,
        latitud: null,
        longitud: null,
        precisionM: null,
        velocidadMps: null,
        bateriaPct: null,
        capturadoEn: null,
      });
    });
  });

  describe('listHistory', () => {
    it('consulta el historial directamente por relación con las sesiones del usuario', async () => {
      prisma.ubicacionUsuarioHistorial.findMany.mockResolvedValue([
        {
          latitud: 15.1,
          longitud: -91.1,
          precisionM: 5,
          velocidadMps: 1.5,
          bateriaPct: 72,
          capturadoEn: new Date('2026-10-05T12:00:00.000Z'),
        },
      ]);
      prisma.ubicacionUsuarioHistorial.count.mockResolvedValue(21);

      const result = await adapter.listHistory(7, {
        page: 2,
        limit: 10,
      });

      const expectedWhere = {
        sesion: {
          usuarioId: 7,
        },
      };

      expect(prisma.ubicacionUsuarioHistorial.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: {
          capturadoEn: 'desc',
        },
        skip: 10,
        take: 10,
        select: {
          latitud: true,
          longitud: true,
          precisionM: true,
          velocidadMps: true,
          bateriaPct: true,
          capturadoEn: true,
        },
      });
      expect(prisma.ubicacionUsuarioHistorial.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(result.meta).toEqual({
        total: 21,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
    });

    it('aplica el rango de captura al trazado histórico', async () => {
      const desde = new Date('2026-10-05T00:00:00.000Z');
      const hasta = new Date('2026-10-05T23:59:59.999Z');

      prisma.ubicacionUsuarioHistorial.findMany.mockResolvedValue([]);
      prisma.ubicacionUsuarioHistorial.count.mockResolvedValue(0);

      await adapter.listHistory(7, {
        desde,
        hasta,
        page: 1,
        limit: 50,
      });

      const expectedWhere = {
        sesion: {
          usuarioId: 7,
        },
        capturadoEn: {
          gte: desde,
          lte: hasta,
        },
      };

      expect(prisma.ubicacionUsuarioHistorial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          skip: 0,
          take: 50,
        }),
      );
      expect(prisma.ubicacionUsuarioHistorial.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('preserva nulls de precisión, velocidad y batería', async () => {
      prisma.ubicacionUsuarioHistorial.findMany.mockResolvedValue([
        {
          latitud: 15.25,
          longitud: -91.25,
          precisionM: null,
          velocidadMps: null,
          bateriaPct: null,
          capturadoEn: new Date('2026-10-05T12:00:00.000Z'),
        },
      ]);
      prisma.ubicacionUsuarioHistorial.count.mockResolvedValue(1);

      const result = await adapter.listHistory(9, {
        page: 1,
        limit: 20,
      });

      expect(result.data[0]).toEqual({
        latitud: 15.25,
        longitud: -91.25,
        precisionM: null,
        velocidadMps: null,
        bateriaPct: null,
        capturadoEn: new Date('2026-10-05T12:00:00.000Z'),
      });
    });
  });
});
