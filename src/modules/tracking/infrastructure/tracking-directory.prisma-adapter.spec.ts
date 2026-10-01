import { TrackingDirectoryPrismaAdapter } from './tracking-directory.prisma-adapter';

describe('TrackingDirectoryPrismaAdapter', () => {
  const prisma = {
    sesionTrackingUsuario: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
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
    it('consulta la sesión activa y la ubicación actual del usuario', async () => {
      const heartbeat = new Date('2026-10-01T16:00:00.000Z');
      const capturedAt = new Date('2026-10-01T15:59:45.000Z');

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

      const result = await adapter.getCurrent(7);

      expect(prisma.sesionTrackingUsuario.findFirst).toHaveBeenCalledWith({
        where: {
          usuarioId: 7,
          estado: 'ACTIVA',
        },
        orderBy: {
          iniciadaEn: 'desc',
        },
        select: {
          id: true,
          ultimoHeartbeatEn: true,
        },
      });

      expect(prisma.ubicacionUsuarioActual.findUnique).toHaveBeenCalledWith({
        where: {
          usuarioId: 7,
        },
        select: {
          sesionId: true,
          latitud: true,
          longitud: true,
          precisionM: true,
          velocidadMps: true,
          bateriaPct: true,
          capturadoEn: true,
        },
      });

      expect(result).toEqual({
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

    it('convierte valores Decimal-like a number', async () => {
      prisma.sesionTrackingUsuario.findFirst.mockResolvedValue({
        id: 10,
        ultimoHeartbeatEn: null,
      });

      prisma.ubicacionUsuarioActual.findUnique.mockResolvedValue({
        sesionId: 10,
        latitud: { valueOf: () => 15.5 },
        longitud: { valueOf: () => -91.5 },
        precisionM: { valueOf: () => 4.25 },
        velocidadMps: { valueOf: () => 1.75 },
        bateriaPct: 60,
        capturadoEn: new Date('2026-10-01T16:00:00.000Z'),
      });

      const result = await adapter.getCurrent(3);

      expect(result.latitud).toBe(15.5);
      expect(result.longitud).toBe(-91.5);
      expect(result.precisionM).toBe(4.25);
      expect(result.velocidadMps).toBe(1.75);
    });

    it('devuelve snapshot vacío cuando no existe sesión ni ubicación actual', async () => {
      prisma.sesionTrackingUsuario.findFirst.mockResolvedValue(null);
      prisma.ubicacionUsuarioActual.findUnique.mockResolvedValue(null);

      const result = await adapter.getCurrent(99);

      expect(result).toEqual({
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
    it('devuelve página vacía cuando el usuario nunca tuvo sesiones', async () => {
      prisma.sesionTrackingUsuario.findMany.mockResolvedValue([]);

      const result = await adapter.listHistory(7, {
        page: 1,
        limit: 20,
      });

      expect(prisma.sesionTrackingUsuario.findMany).toHaveBeenCalledWith({
        where: {
          usuarioId: 7,
        },
        select: {
          id: true,
        },
      });

      expect(prisma.ubicacionUsuarioHistorial.findMany).not.toHaveBeenCalled();
      expect(prisma.ubicacionUsuarioHistorial.count).not.toHaveBeenCalled();

      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
      });
    });

    it('consulta historial de todas las sesiones del usuario con paginación', async () => {
      prisma.sesionTrackingUsuario.findMany.mockResolvedValue([
        { id: 10 },
        { id: 11 },
      ]);

      prisma.ubicacionUsuarioHistorial.findMany.mockResolvedValue([
        {
          latitud: 15.1,
          longitud: -91.1,
          precisionM: 5,
          velocidadMps: 1.5,
          bateriaPct: 72,
          capturadoEn: new Date('2026-10-01T12:00:00.000Z'),
        },
      ]);

      prisma.ubicacionUsuarioHistorial.count.mockResolvedValue(21);

      const result = await adapter.listHistory(7, {
        page: 2,
        limit: 10,
      });

      expect(prisma.ubicacionUsuarioHistorial.findMany).toHaveBeenCalledWith({
        where: {
          sesionId: {
            in: [10, 11],
          },
        },
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
        where: {
          sesionId: {
            in: [10, 11],
          },
        },
      });

      expect(result.meta).toEqual({
        total: 21,
        page: 2,
        limit: 10,
        totalPages: 3,
      });

      expect(result.data).toEqual([
        {
          latitud: 15.1,
          longitud: -91.1,
          precisionM: 5,
          velocidadMps: 1.5,
          bateriaPct: 72,
          capturadoEn: new Date('2026-10-01T12:00:00.000Z'),
        },
      ]);
    });

    it('aplica rango de fechas al historial', async () => {
      const desde = new Date('2026-10-01T00:00:00.000Z');
      const hasta = new Date('2026-10-01T23:59:59.999Z');

      prisma.sesionTrackingUsuario.findMany.mockResolvedValue([
        { id: 10 },
      ]);

      prisma.ubicacionUsuarioHistorial.findMany.mockResolvedValue([]);
      prisma.ubicacionUsuarioHistorial.count.mockResolvedValue(0);

      await adapter.listHistory(7, {
        desde,
        hasta,
        page: 1,
        limit: 50,
      });

      const expectedWhere = {
        sesionId: {
          in: [10],
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
      prisma.sesionTrackingUsuario.findMany.mockResolvedValue([
        { id: 20 },
      ]);

      prisma.ubicacionUsuarioHistorial.findMany.mockResolvedValue([
        {
          latitud: 15.25,
          longitud: -91.25,
          precisionM: null,
          velocidadMps: null,
          bateriaPct: null,
          capturadoEn: new Date('2026-10-01T12:00:00.000Z'),
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
        capturadoEn: new Date('2026-10-01T12:00:00.000Z'),
      });
    });
  });
});
