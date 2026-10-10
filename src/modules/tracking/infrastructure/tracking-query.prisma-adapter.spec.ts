import { TrackingQueryPrismaAdapter } from './tracking-query.prisma-adapter';

describe('TrackingQueryPrismaAdapter', () => {
  const prisma = {
    asistencia: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    ubicacionUsuarioHistorial: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    sesionTrackingUsuario: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;

  const adapter = new TrackingQueryPrismaAdapter(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('history excluye asistencias legacy sin sesiones de tracking', async () => {
    prisma.asistencia.findMany.mockResolvedValue([]);
    prisma.asistencia.count.mockResolvedValue(0);

    await adapter.listHistory({
      page: 1,
      limit: 25,
    });

    expect(prisma.asistencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sesionesTracking: {
            some: {},
          },
        }),
        orderBy: [
          { fecha: 'desc' },
          { entrada: 'desc' },
          { id: 'desc' },
        ],
      }),
    );

    expect(prisma.asistencia.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        sesionesTracking: {
          some: {},
        },
      }),
    });
  });

  it('history aplica estado de sesión sin perder el filtro de jornada tracking', async () => {
    prisma.asistencia.findMany.mockResolvedValue([]);
    prisma.asistencia.count.mockResolvedValue(0);

    await adapter.listHistory({
      page: 1,
      limit: 25,
      estadoSesion: 'EXPIRADA',
    });

    expect(prisma.asistencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sesionesTracking: {
            some: {
              estado: 'EXPIRADA',
            },
          },
        }),
      }),
    );
  });

  it('detail no presenta una asistencia legacy sin sesiones', async () => {
    prisma.asistencia.findUnique.mockResolvedValue({
      id: 4,
      fecha: new Date('2026-10-05T00:00:00.000Z'),
      entrada: new Date('2026-10-05T14:00:00.000Z'),
      salida: null,
      usuario: {
        id: 7,
        nombre: 'Usuario',
        correo: 'u@example.com',
        rol: 'VENDEDOR',
        activo: true,
      },
      sesionesTracking: [],
    });

    await expect(adapter.getAttendanceDetail(4)).resolves.toBeNull();

    expect(
      prisma.ubicacionUsuarioHistorial.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('detail obtiene solo extremos y count, no carga el recorrido completo', async () => {
    const first = {
      latitud: 15.1,
      longitud: -91.1,
      bateriaPct: 90,
      capturadoEn: new Date('2026-10-05T14:00:00.000Z'),
    };
    const last = {
      latitud: 15.2,
      longitud: -91.2,
      bateriaPct: 70,
      capturadoEn: new Date('2026-10-05T15:00:00.000Z'),
    };

    prisma.asistencia.findUnique.mockResolvedValue({
      id: 4,
      fecha: new Date('2026-10-05T00:00:00.000Z'),
      entrada: new Date('2026-10-05T14:00:00.000Z'),
      salida: new Date('2026-10-05T15:00:00.000Z'),
      usuario: {
        id: 7,
        nombre: 'Usuario',
        correo: 'u@example.com',
        rol: 'VENDEDOR',
        activo: true,
      },
      sesionesTracking: [
        {
          id: 31,
          estado: 'FINALIZADA',
          iniciadaEn: new Date('2026-10-05T14:00:00.000Z'),
          finalizadaEn: new Date('2026-10-05T15:00:00.000Z'),
          ultimoHeartbeatEn: new Date('2026-10-05T14:59:00.000Z'),
          _count: {
            ubicaciones: 1200,
          },
        },
      ],
    });

    prisma.ubicacionUsuarioHistorial.findFirst
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(last);

    const result = await adapter.getAttendanceDetail(4);

    expect(result.sesiones[0]).toEqual(
      expect.objectContaining({
        id: 31,
        puntosRegistrados: 1200,
        bateriaInicial: 90,
        bateriaFinal: 70,
        primeraUbicacion: {
          latitud: 15.1,
          longitud: -91.1,
          capturadoEn: first.capturadoEn,
        },
        ultimaUbicacion: {
          latitud: 15.2,
          longitud: -91.2,
          capturadoEn: last.capturadoEn,
        },
      }),
    );

    expect(prisma.ubicacionUsuarioHistorial.findFirst).toHaveBeenCalledTimes(2);
  });
});
