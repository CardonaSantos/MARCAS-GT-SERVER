import { DispatchPrismaQueryAdapter } from './dispatch.prisma-query.adapter';

function createPrismaMock() {
  const prisma: any = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),

    pedido: {
      findMany: jest.fn(),
    },

    ordenDespacho: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },

    ordenDespachoDetalle: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },

    ordenDespachoEvento: {
      count: jest.fn(),
      findMany: jest.fn(),
    },

    operacionDespacho: {
      count: jest.fn(),
      findMany: jest.fn(),
    },

    operacionDespachoDetalle: {
      findMany: jest.fn(),
    },

    reservaInventario: {
      findMany: jest.fn(),
    },

    stockBodega: {
      findMany: jest.fn(),
    },

    usuario: {
      findMany: jest.fn(),
    },
  };

  return prisma;
}

function user(id: number, nombre = `Usuario ${id}`, rol = 'BODEGA') {
  return {
    id,
    nombre,
    correo: `u${id}@test.gt`,
    rol,
  };
}

function warehouse(id = 1, nombre = 'Bodega Central') {
  return {
    id,
    codigo: `BOD-${id}`,
    nombre,
    esPrincipal: id === 1,
  };
}

function customer(id = 1) {
  return {
    id,
    nombre: 'Ana',
    apellido: 'López',
    telefono: '55550000',
    correo: 'ana@test.gt',
    direccion: 'Jacaltenango',
  };
}

function product(id = 301, nombre = 'Producto A') {
  return {
    id,
    codigoProducto: `PRD-${id}`,
    nombre,
  };
}

function orderDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 201,
    pedidoId: 20,
    productoId: 301,
    cantidadSolicitada: 10,
    cantidadReservada: 4,
    cantidadDespachada: 2,
    cantidadEntregada: 0,
    precioUnitario: '10.00',
    descuentoMonto: '0.00',
    subtotal: '100.00',
    observaciones: null,
    version: 0,
    creadoEn: new Date('2026-10-01T12:00:00.000Z'),
    actualizadoEn: new Date('2026-10-01T12:00:00.000Z'),
    producto: product(),
    ...overrides,
  };
}

function dispatchDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    ordenDespachoId: 50,
    pedidoDetalleId: 201,
    productoId: 301,
    cantidadProgramada: 10,
    cantidadPreparada: 6,
    cantidadDespachada: 2,
    observaciones: null,
    version: 0,
    creadoEn: new Date('2026-10-01T12:00:00.000Z'),
    actualizadoEn: new Date('2026-10-01T14:00:00.000Z'),
    producto: product(),
    pedidoDetalle: {
      cantidadSolicitada: 10,
      cantidadReservada: 4,
      cantidadDespachada: 2,
      cantidadEntregada: 0,
    },
    ...overrides,
  };
}

function dispatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 50,
    pedidoId: 20,
    bodegaId: 1,
    creadoPorId: 7,
    preparadoPorId: null,
    despachadoPorId: null,
    canceladoPorId: null,
    numero: 'DSP-000050',
    estado: 'PREPARANDO',
    programadoEn: new Date('2026-10-01T15:00:00.000Z'),
    preparacionIniciadaEn: new Date('2026-10-01T14:00:00.000Z'),
    preparadoEn: null,
    despachadoEn: null,
    canceladoEn: null,
    motivoCancelacion: null,
    observaciones: 'Preparación prioritaria',
    version: 1,
    creadoEn: new Date('2026-10-01T12:00:00.000Z'),
    actualizadoEn: new Date('2026-10-01T14:00:00.000Z'),
    pedido: {
      id: 20,
      numero: 'PED-000020',
      estado: 'EN_PREPARACION',
      condicionPago: 'CONTRAENTREGA',
      estadoPago: 'PENDIENTE',
      total: '100.00',
      cliente: customer(),
      vendedor: user(8, 'Vendedor Uno', 'VENDEDOR'),
    },
    bodega: warehouse(),
    creadoPor: user(7, 'Bodega Uno'),
    preparadoPor: null,
    despachadoPor: null,
    canceladoPor: null,
    detalles: [dispatchDetail()],
    eventos: [
      {
        id: 1,
        tipo: 'PREPARACION_INICIADA',
        detalle: 'Inicio',
        usuarioId: 7,
        referenciaTipo: null,
        referenciaId: null,
        metadata: null,
        claveIdempotencia: null,
        creadoEn: new Date('2026-10-01T14:00:00.000Z'),
        usuario: user(7, 'Bodega Uno'),
      },
    ],
    envios: [],
    entregas: [],
    ...overrides,
  };
}

describe('DispatchPrismaQueryAdapter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('listCandidates', () => {
    it('calcula el pendiente real usando el mayor entre programado y despachado', async () => {
      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);

      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ id: 20 }]);

      prisma.pedido.findMany.mockResolvedValue([
        {
          id: 20,
          numero: 'PED-000020',
          empresaId: 9,
          clienteId: 1,
          vendedorId: 8,
          estado: 'PARCIALMENTE_DESPACHADO',
          condicionPago: 'CONTRAENTREGA',
          estadoPago: 'PENDIENTE',
          total: '100.00',
          confirmadoEn: new Date('2026-10-01T10:00:00.000Z'),
          creadoEn: new Date('2026-10-01T09:00:00.000Z'),
          cliente: customer(),
          vendedor: user(8, 'Vendedor Uno', 'VENDEDOR'),
          detalles: [
            orderDetail({
              id: 201,
              cantidadSolicitada: 10,
              cantidadDespachada: 7,
            }),
          ],
        },
      ]);

      prisma.ordenDespachoDetalle.groupBy.mockResolvedValue([
        {
          pedidoDetalleId: 201,
          _sum: { cantidadProgramada: 5 },
        },
      ]);

      prisma.stockBodega.findMany.mockResolvedValue([
        {
          id: 700,
          bodegaId: 1,
          productoId: 301,
          cantidadReal: 8,
          cantidadReservada: 2,
          cantidadDisponible: 6,
        },
      ]);

      const result = await adapter.listCandidates({
        page: 1,
        limit: 20,
        empresaId: 9,
        bodegaId: 1,
      });

      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      expect(result.data[0].lineas[0]).toEqual(
        expect.objectContaining({
          pedidoDetalleId: 201,
          cantidadSolicitada: 10,
          cantidadDespachada: 7,
          cantidadProgramadaActiva: 5,
          cantidadPendientePlanificar: 3,
        }),
      );

      expect(result.data[0].lineas[0].disponibilidadBodega).toEqual(
        expect.objectContaining({
          bodegaId: 1,
          disponible: 6,
          suficienteParaPendiente: true,
        }),
      );
    });

    it('mantiene la paginación aunque no existan candidatos', async () => {
      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);

      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([]);

      const result = await adapter.listCandidates({
        page: 3,
        limit: 10,
        empresaId: 9,
      });

      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          page: 3,
          limit: 10,
          totalPages: 0,
        },
      });

      expect(prisma.pedido.findMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('devuelve progreso, horas, actividad y resumen de operaciones', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-01T16:00:00.000Z'));

      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);
      const row = dispatchRow();

      prisma.ordenDespacho.count.mockResolvedValue(1);
      prisma.ordenDespacho.findMany.mockResolvedValue([row]);
      prisma.operacionDespacho.findMany.mockResolvedValue([
        {
          id: 91,
          ordenDespachoId: 50,
          tipo: 'SALIDA_DESPACHO',
          estado: 'FALLIDA',
          ocurridaEn: new Date('2026-10-01T15:00:00.000Z'),
        },
        {
          id: 90,
          ordenDespachoId: 50,
          tipo: 'RESERVA_PREPARACION',
          estado: 'APLICADA',
          ocurridaEn: new Date('2026-10-01T14:00:00.000Z'),
        },
      ]);

      const result = await adapter.list({
        page: 1,
        limit: 20,
        empresaId: 9,
        estado: 'PREPARANDO',
        soloAtrasados: true,
        conPendientePreparacion: true,
        sortBy: 'creadoEn',
        sortDir: 'desc',
      });

      expect(result.data[0].progreso).toEqual({
        productos: 1,
        unidadesProgramadas: 10,
        unidadesPreparadas: 6,
        unidadesDespachadas: 2,
        unidadesPendientesPreparacion: 4,
        unidadesPendientesDespacho: 4,
        porcentajePreparacion: 60,
        porcentajeDespacho: 20,
      });

      expect(result.data[0].tiempos).toEqual(
        expect.objectContaining({
          atrasado: true,
          horasAtraso: 1,
          horasEsperaPreparacion: 2,
          horasDesdeActualizacion: 2,
        }),
      );

      expect(result.data[0].operaciones).toEqual(
        expect.objectContaining({
          total: 2,
          fallidas: 1,
          ultimaOperacion: expect.objectContaining({
            id: 91,
            estado: 'FALLIDA',
          }),
        }),
      );

      expect(result.data[0].ultimaActividad).toEqual(
        expect.objectContaining({
          tipo: 'PREPARACION_INICIADA',
        }),
      );

      const countArg = prisma.ordenDespacho.count.mock.calls[0][0];
      expect(countArg.where.pedido.is.empresaId).toBe(9);
      expect(countArg.where.AND).toEqual(
        expect.arrayContaining([
          { estado: 'PREPARANDO' },
          expect.objectContaining({
            programadoEn: expect.any(Object),
          }),
        ]),
      );
    });
  });

  describe('getById', () => {
    it('enriquece detalle con inventario y habilita acciones operativas a ADMIN', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-01T16:00:00.000Z'));

      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);

      const row = dispatchRow({
        estado: 'PREPARADA',
        preparacionIniciadaEn: new Date('2026-10-01T13:00:00.000Z'),
        preparadoEn: new Date('2026-10-01T14:30:00.000Z'),
        detalles: [
          dispatchDetail({
            cantidadProgramada: 10,
            cantidadPreparada: 10,
            cantidadDespachada: 2,
          }),
        ],
        envios: [
          {
            creadoEn: new Date('2026-10-01T15:00:00.000Z'),
            envio: {
              id: 801,
              estado: 'PROGRAMADO',
              guia: 'GUIA-1',
              salidaEn: null,
              completadoEn: null,
              creadoEn: new Date('2026-10-01T15:00:00.000Z'),
            },
          },
        ],
        entregas: [
          {
            id: 901,
            estado: 'PENDIENTE',
            receptorNombre: null,
            entregadoEn: null,
            creadoEn: new Date('2026-10-01T15:10:00.000Z'),
          },
        ],
      });

      prisma.ordenDespacho.findFirst.mockResolvedValue(row);

      prisma.reservaInventario.findMany.mockResolvedValue([
        {
          id: 600,
          pedidoDetalleId: 201,
          stockBodegaId: 700,
          cantidadOriginal: 10,
          cantidadPendiente: 8,
          cantidadAplicada: 2,
          cantidadLiberada: 0,
          estado: 'PARCIAL',
          stockBodega: {
            id: 700,
            bodegaId: 1,
            productoId: 301,
            cantidadReal: 20,
            cantidadReservada: 8,
            cantidadDisponible: 12,
          },
        },
      ]);

      prisma.stockBodega.findMany.mockResolvedValue([]);
      prisma.operacionDespacho.findMany.mockResolvedValue([]);

      const result = await adapter.getById(50, {
        empresaId: 9,
        rol: 'ADMIN',
      });

      expect(result).not.toBeNull();
      expect(result!.detalles[0].inventario).toEqual(
        expect.objectContaining({
          stockId: 700,
          real: 20,
          reservado: 8,
          disponible: 12,
          reserva: expect.objectContaining({
            id: 600,
            cantidadPendiente: 8,
            cantidadAplicada: 2,
          }),
        }),
      );

      expect(result!.acciones).toEqual(
        expect.objectContaining({
          puedeDespachar: true,
          puedeCancelar: true,
          puedeAgregarObservacion: true,
        }),
      );

      expect(result!.advertencias).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            codigo: 'SALIDA_PENDIENTE',
          }),
        ]),
      );

      expect(result!.envios[0].guia).toBe('GUIA-1');
      expect(result!.entregas[0].estado).toBe('PENDIENTE');
    });

    it('aplica scope de VENDEDOR y no expone acciones operativas', async () => {
      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);

      prisma.ordenDespacho.findFirst.mockResolvedValue(
        dispatchRow({
          estado: 'PREPARADA',
          detalles: [
            dispatchDetail({
              cantidadPreparada: 10,
              cantidadDespachada: 0,
            }),
          ],
        }),
      );
      prisma.reservaInventario.findMany.mockResolvedValue([]);
      prisma.stockBodega.findMany.mockResolvedValue([]);
      prisma.operacionDespacho.findMany.mockResolvedValue([]);

      const result = await adapter.getById(50, {
        empresaId: 9,
        vendedorId: 8,
        rol: 'VENDEDOR',
      });

      const call = prisma.ordenDespacho.findFirst.mock.calls[0][0];

      expect(call.where.pedido.is).toEqual(
        expect.objectContaining({
          empresaId: 9,
          vendedorId: 8,
        }),
      );

      expect(result!.acciones).toEqual({
        puedeEditar: false,
        puedeIniciarPreparacion: false,
        puedeActualizarPreparacion: false,
        puedeFinalizarPreparacion: false,
        puedeDespachar: false,
        puedeCancelar: false,
        puedeAgregarObservacion: true,
      });
    });
  });

  describe('listOperations', () => {
    it('no consulta operaciones si no existen despachos dentro del scope', async () => {
      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);

      prisma.ordenDespacho.findMany.mockResolvedValue([]);

      const result = await adapter.listOperations({
        page: 1,
        limit: 20,
        empresaId: 9,
        vendedorId: 8,
      });

      expect(result.meta.total).toBe(0);
      expect(result.data).toEqual([]);
      expect(prisma.operacionDespacho.count).not.toHaveBeenCalled();
    });
  });

  describe('getSummary', () => {
    it('calcula KPIs, tiempos, top bodega y top operador', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-01T16:00:00.000Z'));

      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);

      prisma.ordenDespacho.findMany.mockResolvedValue([
        {
          id: 50,
          estado: 'PREPARANDO',
          bodega: warehouse(1, 'Central'),
          creadoEn: new Date('2026-10-01T12:00:00.000Z'),
          actualizadoEn: new Date('2026-10-01T14:00:00.000Z'),
          programadoEn: new Date('2026-10-01T15:00:00.000Z'),
          preparacionIniciadaEn: new Date('2026-10-01T14:00:00.000Z'),
          preparadoEn: null,
          despachadoEn: null,
          detalles: [
            {
              cantidadProgramada: 10,
              cantidadPreparada: 4,
              cantidadDespachada: 0,
            },
          ],
        },
        {
          id: 51,
          estado: 'DESPACHADA',
          bodega: warehouse(1, 'Central'),
          creadoEn: new Date('2026-10-01T10:00:00.000Z'),
          actualizadoEn: new Date('2026-10-01T13:00:00.000Z'),
          programadoEn: new Date('2026-10-01T14:00:00.000Z'),
          preparacionIniciadaEn: new Date('2026-10-01T11:00:00.000Z'),
          preparadoEn: new Date('2026-10-01T12:00:00.000Z'),
          despachadoEn: new Date('2026-10-01T13:00:00.000Z'),
          detalles: [
            {
              cantidadProgramada: 5,
              cantidadPreparada: 5,
              cantidadDespachada: 5,
            },
          ],
        },
      ]);

      prisma.operacionDespacho.findMany.mockResolvedValue([
        {
          id: 100,
          ordenDespachoId: 51,
          usuarioId: 7,
          estado: 'APLICADA',
        },
        {
          id: 101,
          ordenDespachoId: 50,
          usuarioId: 7,
          estado: 'FALLIDA',
        },
      ]);

      prisma.operacionDespachoDetalle.findMany.mockResolvedValue([
        {
          id: 1001,
          operacionId: 100,
          cantidad: 5,
          estado: 'APLICADA',
        },
        {
          id: 1002,
          operacionId: 101,
          cantidad: 2,
          estado: 'FALLIDA',
        },
      ]);

      prisma.usuario.findMany.mockResolvedValue([
        user(7, 'Operador Uno', 'BODEGA'),
      ]);

      const result = await adapter.getSummary({
        empresaId: 9,
      });

      expect(result.totalOrdenes).toBe(2);
      expect(result.abiertas).toBe(1);
      expect(result.atrasadas).toBe(1);

      expect(result.unidades).toEqual({
        programadas: 15,
        preparadas: 9,
        despachadas: 5,
        pendientesPreparacion: 6,
        pendientesDespacho: 4,
      });

      expect(result.porcentajes).toEqual({
        preparacion: 60,
        despacho: 33.33,
      });

      expect(result.tiemposPromedioHoras).toEqual({
        esperaPreparacion: 1.5,
        preparacion: 1,
        esperaSalida: 1,
        cicloCompleto: 3,
      });

      expect(result.operaciones).toEqual({
        total: 2,
        pendientes: 0,
        aplicando: 0,
        aplicadas: 1,
        fallidas: 1,
      });

      expect(result.hoy).toEqual(
        expect.objectContaining({
          programadas: 2,
          creadas: 2,
          preparadas: 1,
          despachadas: 1,
          atrasadas: 1,
          preparandoAhora: 1,
        }),
      );

      expect(result.topBodegas[0]).toEqual(
        expect.objectContaining({
          ordenes: 2,
          unidadesDespachadas: 5,
        }),
      );

      expect(result.topOperadores[0]).toEqual(
        expect.objectContaining({
          operacionesAplicadas: 1,
          unidadesProcesadas: 5,
        }),
      );
    });
  });

  describe('getOperationalReport', () => {
    it('calcula puntualidad, aging, confiabilidad, tendencia y desempeño por bodega', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-01T16:00:00.000Z'));

      const prisma = createPrismaMock();
      const adapter = new DispatchPrismaQueryAdapter(prisma);

      const bodega = warehouse(1, 'Central');

      prisma.ordenDespacho.findMany
        .mockResolvedValueOnce([
          {
            id: 1,
            creadoEn: new Date('2026-09-30T15:00:00.000Z'),
          },
          {
            id: 2,
            creadoEn: new Date('2026-10-01T12:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            preparadoEn: new Date('2026-09-30T17:00:00.000Z'),
            preparacionIniciadaEn: new Date('2026-09-30T16:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            creadoEn: new Date('2026-09-30T14:00:00.000Z'),
            programadoEn: new Date('2026-09-30T18:00:00.000Z'),
            preparacionIniciadaEn: new Date('2026-09-30T15:00:00.000Z'),
            preparadoEn: new Date('2026-09-30T16:00:00.000Z'),
            despachadoEn: new Date('2026-09-30T17:00:00.000Z'),
            bodega,
            detalles: [{ cantidadDespachada: 4 }],
          },
          {
            id: 2,
            creadoEn: new Date('2026-10-01T08:00:00.000Z'),
            programadoEn: new Date('2026-10-01T12:00:00.000Z'),
            preparacionIniciadaEn: new Date('2026-10-01T09:00:00.000Z'),
            preparadoEn: new Date('2026-10-01T11:00:00.000Z'),
            despachadoEn: new Date('2026-10-01T13:00:00.000Z'),
            bodega,
            detalles: [{ cantidadDespachada: 3 }],
          },
          {
            id: 3,
            creadoEn: new Date('2026-10-01T09:00:00.000Z'),
            programadoEn: null,
            preparacionIniciadaEn: new Date('2026-10-01T10:00:00.000Z'),
            preparadoEn: new Date('2026-10-01T11:00:00.000Z'),
            despachadoEn: new Date('2026-10-01T12:00:00.000Z'),
            bodega,
            detalles: [{ cantidadDespachada: 2 }],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 10,
            creadoEn: new Date('2026-10-01T14:00:00.000Z'),
          },
          {
            id: 11,
            creadoEn: new Date('2026-10-01T10:00:00.000Z'),
          },
          {
            id: 12,
            creadoEn: new Date('2026-10-01T04:00:00.000Z'),
          },
          {
            id: 13,
            creadoEn: new Date('2026-09-30T10:00:00.000Z'),
          },
          {
            id: 14,
            creadoEn: new Date('2026-09-29T04:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          { id: 1 },
          { id: 2 },
          { id: 3 },
          { id: 10 },
          { id: 11 },
          { id: 12 },
          { id: 13 },
          { id: 14 },
        ]);

      prisma.operacionDespacho.findMany.mockResolvedValue([
        {
          id: 100,
          ordenDespachoId: 1,
          estado: 'APLICADA',
          intentos: 1,
          ocurridaEn: new Date('2026-09-30T17:00:00.000Z'),
        },
        {
          id: 101,
          ordenDespachoId: 2,
          estado: 'FALLIDA',
          intentos: 2,
          ocurridaEn: new Date('2026-10-01T11:00:00.000Z'),
        },
        {
          id: 102,
          ordenDespachoId: 3,
          estado: 'APLICADA',
          intentos: 2,
          ocurridaEn: new Date('2026-10-01T12:00:00.000Z'),
        },
      ]);

      const desde = new Date('2026-09-29T00:00:00.000Z');
      const hasta = new Date('2026-10-01T16:00:00.000Z');

      const result = await adapter.getOperationalReport({
        empresaId: 9,
        fechaDesde: desde,
        fechaHasta: hasta,
      });

      expect(result.puntualidad).toEqual({
        despachadas: 3,
        aTiempo: 1,
        tarde: 1,
        sinProgramacion: 1,
        porcentajeATiempo: 50,
      });

      expect(result.colaAbierta).toEqual({
        total: 5,
        menos4h: 1,
        de4a8h: 1,
        de8a24h: 1,
        de24a48h: 1,
        mas48h: 1,
      });

      expect(result.confiabilidadOperaciones).toEqual({
        total: 3,
        aplicadas: 2,
        fallidas: 1,
        conReintentos: 2,
        tasaFallo: 33.33,
        porcentajeConReintento: 66.67,
        intentosPromedio: 1.67,
      });

      expect(result.tendenciaDiaria).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fecha: '2026-09-30',
            creadas: 1,
            preparadas: 1,
            despachadas: 1,
            unidadesDespachadas: 4,
          }),
          expect.objectContaining({
            fecha: '2026-10-01',
            creadas: 1,
            despachadas: 2,
            unidadesDespachadas: 5,
            fallosOperacion: 1,
          }),
        ]),
      );

      expect(result.bodegas[0]).toEqual(
        expect.objectContaining({
          ordenes: 3,
          despachadas: 3,
          unidadesDespachadas: 9,
          porcentajeATiempo: 50,
        }),
      );
    });
  });
});
