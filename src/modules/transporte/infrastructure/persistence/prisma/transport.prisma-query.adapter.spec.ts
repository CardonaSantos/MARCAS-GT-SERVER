import { TransportPrismaQueryAdapter } from './transport.prisma-query.adapter';

describe('TransportPrismaQueryAdapter', () => {
  const prisma = {
    envio: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    envioCargaDetalle: {
      aggregate: jest.fn(),
    },
    envioIncidencia: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    envioEvento: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    ordenDespacho: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    transportista: {
      findMany: jest.fn(),
    },
    vehiculo: {
      findMany: jest.fn(),
    },
    conductor: {
      findMany: jest.fn(),
    },
  } as any;

  const adapter = new TransportPrismaQueryAdapter(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getShipmentState', () => {
    it('aplica scope por empresa', async () => {
      prisma.envio.findFirst.mockResolvedValue({
        id: 10,
        estado: 'PROGRAMADO',
        modalidad: 'INTERNO',
        version: 2,
        bodegaId: 3,
        vehiculoId: null,
        conductorId: null,
        responsableId: null,
      });

      const result = await adapter.getShipmentState(10, {
        empresaId: 5,
        rol: 'ADMIN',
      });

      expect(prisma.envio.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 10,
            empresaId: 5,
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 10,
          estado: 'PROGRAMADO',
          modalidad: 'INTERNO',
          version: 2,
        }),
      );
    });

    it('agrega scope por responsable para REPARTIDOR', async () => {
      prisma.envio.findFirst.mockResolvedValue(null);

      await adapter.getShipmentState(10, {
        empresaId: 5,
        rol: 'REPARTIDOR',
        responsableId: 77,
      });

      expect(prisma.envio.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 10,
            empresaId: 5,
            responsableId: 77,
          }),
        }),
      );
    });

    it('agrega scope por vendedor mediante pedido', async () => {
      prisma.envio.findFirst.mockResolvedValue(null);

      await adapter.getShipmentState(10, {
        empresaId: 5,
        rol: 'VENDEDOR',
        vendedorId: 91,
      });

      expect(prisma.envio.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            empresaId: 5,
            despachos: {
              some: {
                ordenDespacho: {
                  pedido: {
                    vendedorId: 91,
                  },
                },
              },
            },
          }),
        }),
      );
    });
  });

  describe('listShipments', () => {
    const baseRow = {
      id: 1,
      numero: 'ENV-000001',
      modalidad: 'INTERNO',
      estado: 'ASIGNADO',
      salidaProgramadaEn: null,
      entregaEstimadaEn: null,
      salidaEn: null,
      completadoEn: null,
      costo: null,
      creadoEn: new Date('2026-10-01T10:00:00.000Z'),
      actualizadoEn: new Date('2026-10-01T10:00:00.000Z'),
      bodega: { id: 2, codigo: 'BC', nombre: 'Bodega Central' },
      transportista: null,
      vehiculo: { id: 3, placa: 'P123ABC', marca: 'Toyota', modelo: 'Hiace' },
      conductor: { id: 4, nombre: 'Juan', telefono: '5555' },
      responsable: { id: 5, nombre: 'Pedro', rol: 'REPARTIDOR' },
      despachos: [
        {
          id: 100,
          estado: 'PENDIENTE',
          cargas: [
            { cantidadPlanificada: 5, cantidadCargada: 3 },
            { cantidadPlanificada: 2, cantidadCargada: 2 },
          ],
        },
        {
          id: 101,
          estado: 'ATENDIDA',
          cargas: [
            { cantidadPlanificada: 4, cantidadCargada: 4 },
          ],
        },
      ],
      incidencias: [],
    };

    beforeEach(() => {
      prisma.envio.findMany.mockResolvedValue([baseRow]);
      prisma.envio.count.mockResolvedValue(1);
    });

    it('devuelve progreso agregado y paginación', async () => {
      const result = await adapter.listShipments({
        page: 1,
        limit: 20,
        sortBy: 'creadoEn',
        sortDir: 'desc',
        scope: { empresaId: 5, rol: 'ADMIN' },
      });

      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      expect(result.data[0].progreso).toEqual({
        paradas: 2,
        paradasAtendidas: 1,
        unidadesPlanificadas: 11,
        unidadesCargadas: 9,
      });
    });

    it('aplica filtros operativos en Prisma', async () => {
      const fechaDesde = new Date('2026-10-01T00:00:00.000Z');
      const fechaHasta = new Date('2026-10-02T00:00:00.000Z');

      await adapter.listShipments({
        page: 2,
        limit: 10,
        search: 'ENV-001',
        estado: 'ASIGNADO',
        modalidad: 'INTERNO',
        bodegaId: 2,
        transportistaId: 3,
        vehiculoId: 4,
        conductorId: 5,
        responsableId: 6,
        clienteId: 7,
        conIncidencia: true,
        fechaDesde,
        fechaHasta,
        sortBy: 'numero',
        sortDir: 'asc',
        scope: { empresaId: 5, rol: 'ADMIN' },
      });

      expect(prisma.envio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          orderBy: { numero: 'asc' },
          where: expect.objectContaining({
            empresaId: 5,
            estado: 'ASIGNADO',
            modalidad: 'INTERNO',
            bodegaId: 2,
            transportistaId: 3,
            vehiculoId: 4,
            conductorId: 5,
            responsableId: 6,
            despachos: {
              some: {
                clienteId: 7,
              },
            },
            incidencias: {
              some: {
                estado: {
                  not: 'RESUELTA',
                },
              },
            },
            creadoEn: {
              gte: fechaDesde,
              lte: fechaHasta,
            },
          }),
        }),
      );
    });

    it('marca SALIDA_ATRASADA cuando corresponde', async () => {
      prisma.envio.findMany.mockResolvedValue([
        {
          ...baseRow,
          estado: 'ASIGNADO',
          salidaProgramadaEn: new Date('2000-01-01T00:00:00.000Z'),
          salidaEn: null,
        },
      ]);

      const result = await adapter.listShipments({
        page: 1,
        limit: 20,
        sortBy: 'creadoEn',
        sortDir: 'desc',
        scope: { empresaId: 5, rol: 'ADMIN' },
      });

      expect(result.data[0].advertencias).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            codigo: 'SALIDA_ATRASADA',
            nivel: 'ADVERTENCIA',
          }),
        ]),
      );
    });

    it('marca INCIDENCIA_ABIERTA cuando existen incidencias abiertas', async () => {
      prisma.envio.findMany.mockResolvedValue([
        {
          ...baseRow,
          incidencias: [{ id: 99 }],
        },
      ]);

      const result = await adapter.listShipments({
        page: 1,
        limit: 20,
        sortBy: 'creadoEn',
        sortDir: 'desc',
        scope: { empresaId: 5, rol: 'ADMIN' },
      });

      expect(result.data[0].advertencias).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            codigo: 'INCIDENCIA_ABIERTA',
            nivel: 'CRITICO',
          }),
        ]),
      );
    });
  });

  describe('getShipment', () => {
    it('devuelve detalle enriquecido, progreso, acciones y snapshots', async () => {
      prisma.envio.findFirst.mockResolvedValue({
        id: 20,
        numero: 'ENV-000020',
        empresaId: 5,
        modalidad: 'INTERNO',
        estado: 'CARGADO',
        version: 3,
        costo: null,
        salidaProgramadaEn: null,
        salidaEn: null,
        bodega: { id: 1, codigo: 'BC', nombre: 'Central', direccion: 'Zona 1' },
        transportista: null,
        vehiculo: { id: 3, placa: 'P123', activo: true },
        conductor: { id: 4, nombre: 'Juan', activo: true },
        responsable: { id: 5, nombre: 'Pedro', correo: 'p@test', rol: 'REPARTIDOR', activo: true },
        creadoPor: { id: 1, nombre: 'Admin', rol: 'ADMIN' },
        asignadoPor: { id: 1, nombre: 'Admin', rol: 'ADMIN' },
        cargaConfirmadaPor: { id: 1, nombre: 'Admin', rol: 'ADMIN' },
        iniciadoPor: null,
        completadoPor: null,
        canceladoPor: null,
        despachos: [
          {
            id: 501,
            estado: 'PENDIENTE',
            secuencia: 1,
            destinatario: 'Cliente Uno',
            telefonoDestino: '5555',
            direccionDestino: 'Zona 2',
            latitudDestino: { toString: () => '15.5000000', valueOf: () => 15.5 },
            longitudDestino: { toString: () => '-91.5000000', valueOf: () => -91.5 },
            cliente: { id: 8, nombre: 'Cliente', apellido: 'Uno', telefono: '5555' },
            ordenDespacho: {
              id: 70,
              numero: 'DSP-000070',
              estado: 'DESPACHADA',
              pedido: {
                id: 60,
                numero: 'PED-000060',
                vendedor: { id: 9, nombre: 'Vendedor' },
              },
            },
            cargas: [
              {
                id: 800,
                ordenDespachoDetalleId: 700,
                cantidadPlanificada: 5,
                cantidadCargada: 5,
                version: 1,
                producto: {
                  id: 100,
                  codigoProducto: 'P001',
                  nombre: 'Producto 1',
                },
              },
            ],
            entrega: null,
          },
        ],
        eventos: [],
        incidencias: [],
      });

      const result = await adapter.getShipment(20, {
        empresaId: 5,
        rol: 'ADMIN',
      });

      expect(result).not.toBeNull();
      expect(result.paradas).toHaveLength(1);
      expect(result.paradas[0]).toEqual(
        expect.objectContaining({
          id: 501,
          secuencia: 1,
          destino: expect.objectContaining({
            destinatario: 'Cliente Uno',
            direccion: 'Zona 2',
          }),
        }),
      );
      expect(result.progreso).toEqual({
        paradas: 1,
        paradasAtendidas: 0,
        unidadesPlanificadas: 5,
        unidadesCargadas: 5,
      });
      expect(result.acciones).toEqual(
        expect.objectContaining({
          puedeIniciarRuta: true,
          puedeCancelar: false,
          puedeConfirmarCarga: false,
        }),
      );
    });

    it('devuelve null si el envío queda fuera del scope', async () => {
      prisma.envio.findFirst.mockResolvedValue(null);

      await expect(
        adapter.getShipment(999, {
          empresaId: 5,
          rol: 'VENDEDOR',
          vendedorId: 10,
        }),
      ).resolves.toBeNull();
    });
  });

  describe('listCandidates', () => {
    const row = {
      id: 40,
      numero: 'DSP-000040',
      estado: 'PREPARADA',
      creadoEn: new Date(),
      bodega: { id: 2, codigo: 'BC', nombre: 'Central' },
      pedido: {
        id: 30,
        numero: 'PED-000030',
        vendedor: { id: 7, nombre: 'Vendedor Uno' },
        cliente: {
          id: 8,
          nombre: 'Cliente',
          apellido: 'Prueba',
          telefono: '5555',
          direccion: 'Zona 1',
        },
      },
      detalles: [
        {
          id: 100,
          cantidadPreparada: 10,
          cantidadDespachada: 7,
          producto: { id: 1, codigoProducto: 'P1', nombre: 'Producto' },
          cargasEnvio: [
            { cantidadPlanificada: 4, cantidadCargada: 3 },
            { cantidadPlanificada: 1, cantidadCargada: 1 },
          ],
        },
      ],
    };

    beforeEach(() => {
      prisma.ordenDespacho.findMany.mockResolvedValue([row]);
      prisma.ordenDespacho.count.mockResolvedValue(1);
    });

    it('calcula correctamente planificable y cargable', async () => {
      const result = await adapter.listCandidates({
        page: 1,
        limit: 20,
        scope: { empresaId: 5, rol: 'ADMIN' },
      });

      expect(result.data[0].lineas[0]).toEqual(
        expect.objectContaining({
          cantidadPreparada: 10,
          cantidadDespachada: 7,
          cantidadYaPlanificada: 5,
          cantidadYaCargada: 4,
          cantidadPlanificable: 5,
          cantidadCargable: 3,
        }),
      );
    });

    it('excluye candidatos sin cantidad planificable', async () => {
      prisma.ordenDespacho.findMany.mockResolvedValue([
        {
          ...row,
          detalles: [
            {
              ...row.detalles[0],
              cantidadPreparada: 5,
              cargasEnvio: [
                {
                  cantidadPlanificada: 5,
                  cantidadCargada: 3,
                },
              ],
            },
          ],
        },
      ]);

      const result = await adapter.listCandidates({
        page: 1,
        limit: 20,
        scope: { empresaId: 5, rol: 'ADMIN' },
      });

      expect(result.data).toHaveLength(0);
    });

    it('aplica scope vendedor a la query de candidatos', async () => {
      await adapter.listCandidates({
        page: 1,
        limit: 20,
        scope: {
          empresaId: 5,
          rol: 'VENDEDOR',
          vendedorId: 77,
        },
      });

      expect(prisma.ordenDespacho.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pedido: expect.objectContaining({
              empresaId: 5,
              vendedorId: 77,
            }),
          }),
        }),
      );
    });
  });

  describe('events/incidents', () => {
    it('pagina eventos si el envío es visible en el scope', async () => {
      prisma.envio.findFirst.mockResolvedValue({
        id: 10,
        estado: 'EN_RUTA',
        modalidad: 'INTERNO',
        version: 3,
        bodegaId: 1,
        vehiculoId: 2,
        conductorId: 3,
        responsableId: 4,
      });
      prisma.envioEvento.findMany.mockResolvedValue([
        { id: 1, tipo: 'RUTA_INICIADA' },
      ]);
      prisma.envioEvento.count.mockResolvedValue(1);

      const result = await adapter.listEvents(
        10,
        { empresaId: 5, rol: 'ADMIN' },
        1,
        10,
      );

      expect(result.data).toHaveLength(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('no filtra incidencias si el envío no está dentro del scope', async () => {
      prisma.envio.findFirst.mockResolvedValue(null);

      const result = await adapter.listIncidents(
        10,
        { empresaId: 5, rol: 'REPARTIDOR', responsableId: 99 },
        1,
        10,
      );

      expect(result.data).toEqual([]);
      expect(prisma.envioIncidencia.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getSummary', () => {
    it('calcula resumen agregado de operación', async () => {
      prisma.envio.count.mockResolvedValue(10);
      prisma.envio.groupBy.mockResolvedValue([
        { estado: 'PROGRAMADO', _count: { _all: 2 } },
        { estado: 'EN_RUTA', _count: { _all: 3 } },
        { estado: 'COMPLETADO', _count: { _all: 4 } },
        { estado: 'CANCELADO', _count: { _all: 1 } },
      ]);
      prisma.envioCargaDetalle.aggregate.mockResolvedValue({
        _sum: {
          cantidadPlanificada: 100,
          cantidadCargada: 80,
        },
      });
      prisma.envioIncidencia.count.mockResolvedValue(2);
      prisma.envio.aggregate.mockResolvedValue({
        _sum: {
          costo: 550,
        },
      });

      const result = await adapter.getSummary({
        empresaId: 5,
        rol: 'ADMIN',
      });

      expect(result).toEqual(
        expect.objectContaining({
          total: 10,
          abiertas: 5,
          unidades: {
            planificadas: 100,
            cargadas: 80,
          },
          incidenciasAbiertas: 2,
          costoExterno: '550',
        }),
      );
      expect(result.porEstado.EN_RUTA).toBe(3);
    });
  });

  describe('getOperationalReport', () => {
    it('calcula puntualidad, tiempos, incidencias y costo externo', async () => {
      prisma.envio.findMany.mockResolvedValue([
        {
          id: 1,
          modalidad: 'INTERNO',
          estado: 'COMPLETADO',
          creadoEn: new Date('2026-10-01T08:00:00.000Z'),
          asignadoEn: new Date('2026-10-01T09:00:00.000Z'),
          cargaConfirmadaEn: new Date('2026-10-01T10:00:00.000Z'),
          salidaProgramadaEn: new Date('2026-10-01T11:00:00.000Z'),
          salidaEn: new Date('2026-10-01T10:30:00.000Z'),
          completadoEn: new Date('2026-10-01T14:30:00.000Z'),
          costo: null,
          bodega: { id: 1, codigo: 'BC', nombre: 'Central' },
          transportista: null,
          vehiculo: { id: 1, placa: 'P1' },
          conductor: { id: 1, nombre: 'Juan' },
          incidencias: [
            { tipo: 'TRAFICO', severidad: 'BAJA', estado: 'RESUELTA' },
          ],
        },
        {
          id: 2,
          modalidad: 'EXTERNO',
          estado: 'EN_RUTA',
          creadoEn: new Date('2026-10-01T08:00:00.000Z'),
          asignadoEn: new Date('2026-10-01T10:00:00.000Z'),
          cargaConfirmadaEn: new Date('2026-10-01T11:00:00.000Z'),
          salidaProgramadaEn: new Date('2026-10-01T11:30:00.000Z'),
          salidaEn: new Date('2026-10-01T12:00:00.000Z'),
          completadoEn: null,
          costo: 250,
          bodega: { id: 1, codigo: 'BC', nombre: 'Central' },
          transportista: { id: 9, nombre: 'Courier' },
          vehiculo: null,
          conductor: null,
          incidencias: [
            { tipo: 'AVERIA', severidad: 'ALTA', estado: 'ABIERTA' },
          ],
        },
      ]);

      const result = await adapter.getOperationalReport({
        empresaId: 5,
        rol: 'ADMIN',
      });

      expect(result.totalEnvios).toBe(2);
      expect(result.modalidad).toEqual({
        internos: 1,
        externos: 1,
      });
      expect(result.puntualidadSalida).toEqual({
        evaluados: 2,
        aTiempo: 1,
        tarde: 1,
        porcentajeATiempo: 50,
      });
      expect(result.tiemposPromedioHoras.creacionAAsignacion).toBe(1.5);
      expect(result.tiemposPromedioHoras.asignacionACarga).toBe(1);
      expect(result.tiemposPromedioHoras.cargaASalida).toBe(0.75);
      expect(result.tiemposPromedioHoras.duracionRuta).toBe(4);
      expect(result.incidencias).toEqual({
        total: 2,
        abiertas: 1,
      });
      expect(result.costoExterno).toBe('250');
    });
  });

  describe('catálogos', () => {
    it('lista transportistas solo de la empresa', async () => {
      prisma.transportista.findMany.mockResolvedValue([]);

      await adapter.listCarriers(
        { empresaId: 5, rol: 'ADMIN' },
        { search: 'cargo', activo: true, tipo: 'EXTERNO' },
      );

      expect(prisma.transportista.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            empresaId: 5,
            activo: true,
            tipo: 'EXTERNO',
            nombre: {
              contains: 'cargo',
              mode: 'insensitive',
            },
          },
        }),
      );
    });

    it('lista vehículos solo de la empresa', async () => {
      prisma.vehiculo.findMany.mockResolvedValue([]);

      await adapter.listVehicles(
        { empresaId: 5, rol: 'ADMIN' },
        { estado: 'DISPONIBLE', activo: true, search: 'P123' },
      );

      expect(prisma.vehiculo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            empresaId: 5,
            activo: true,
            estado: 'DISPONIBLE',
          }),
        }),
      );
    });

    it('lista conductores solo de la empresa', async () => {
      prisma.conductor.findMany.mockResolvedValue([]);

      await adapter.listDrivers(
        { empresaId: 5, rol: 'ADMIN' },
        { estado: 'DISPONIBLE', activo: true, search: 'Juan' },
      );

      expect(prisma.conductor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            empresaId: 5,
            activo: true,
            estado: 'DISPONIBLE',
            nombre: {
              contains: 'Juan',
              mode: 'insensitive',
            },
          },
        }),
      );
    });
  });
});
