import { PrismaClient } from '@prisma/client';
import {
  TransportConcurrentModificationError,
  TransportQuantityExceededError,
} from '../../src/modules/transporte/domain/errors/transport.errors';
import { TransportDeliveryGateAdapter } from '../../src/modules/transporte/infrastructure/adapters/transport-delivery-gate.adapter';
import { TransportDirectoryAdapter } from '../../src/modules/transporte/infrastructure/adapters/transport-directory.adapter';
import { TransportWorkflowPrismaAdapter } from '../../src/modules/transporte/infrastructure/persistence/prisma/transport-workflow.prisma-adapter';
import { createIntegrationPrisma } from './integration-db';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
  TransportIntegrationFixture,
} from './transport-fixture';
import {
  assignInternalShipment,
  confirmFullLoad,
  createExternalShipment,
  createInternalShipment,
  startInternalRoute,
} from './transport-test-helpers';

describe('Transporte workflow / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: TransportIntegrationFixture | null = null;
  let workflow: TransportWorkflowPrismaAdapter;
  let directory: TransportDirectoryAdapter;
  let deliveryGate: TransportDeliveryGateAdapter;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();

    workflow = new TransportWorkflowPrismaAdapter(prisma as any);
    directory = new TransportDirectoryAdapter(prisma as any);
    deliveryGate = new TransportDeliveryGateAdapter(prisma as any);
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

  it('crea Envio + parada + carga + evento CREADO de forma atómica', async () => {
    const f = fixture!;
    const created = await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    const row = await prisma.envio.findUniqueOrThrow({
      where: {
        id: created.id,
      },
      include: {
        despachos: {
          include: {
            cargas: true,
          },
        },
        eventos: true,
      },
    });

    expect(row.numero).toBe(
      `ENV-${String(row.id).padStart(6, '0')}`,
    );
    expect(row.empresaId).toBe(f.empresa.id);
    expect(row.bodegaId).toBe(f.bodega.id);
    expect(row.modalidad).toBe('INTERNO');
    expect(row.estado).toBe('PROGRAMADO');
    expect(row.version).toBe(0);

    expect(row.despachos).toHaveLength(1);
    expect(row.despachos[0].clienteId).toBe(f.cliente.id);
    expect(row.despachos[0].secuencia).toBe(1);
    expect(row.despachos[0].estado).toBe('PENDIENTE');

    expect(row.despachos[0].cargas).toHaveLength(1);
    expect(row.despachos[0].cargas[0]).toEqual(
      expect.objectContaining({
        ordenDespachoDetalleId: f.dispatches[0].detalle.id,
        productoId: f.producto.id,
        cantidadPlanificada: 6,
        cantidadCargada: 0,
        version: 0,
      }),
    );

    expect(row.eventos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: 'CREADO',
          estado: 'PROGRAMADO',
          usuarioId: f.admin.id,
        }),
      ]),
    );
  });

  it('asigna recursos internos y reserva vehículo/conductor en la misma transacción', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await workflow.assignResources({
      shipmentId: shipment.id,
      expectedVersion: 0,
      actorId: f.admin.id,
      modalidad: 'INTERNO',
      vehiculoId: f.vehiculo.id,
      conductorId: f.conductor.id,
      responsableId: f.repartidor.id,
      claveIdempotencia: `${f.tag}:assign`,
    });

    const [envio, vehiculo, conductor] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: {
          id: shipment.id,
        },
      }),
      prisma.vehiculo.findUniqueOrThrow({
        where: {
          id: f.vehiculo.id,
        },
      }),
      prisma.conductor.findUniqueOrThrow({
        where: {
          id: f.conductor.id,
        },
      }),
    ]);

    expect(envio.estado).toBe('ASIGNADO');
    expect(envio.version).toBe(1);
    expect(envio.vehiculoId).toBe(f.vehiculo.id);
    expect(envio.conductorId).toBe(f.conductor.id);
    expect(envio.responsableId).toBe(f.repartidor.id);

    expect(vehiculo.estado).toBe('RESERVADO');
    expect(vehiculo.version).toBe(1);

    expect(conductor.estado).toBe('ASIGNADO');
    expect(conductor.version).toBe(1);
  });

  it('la asignación es idempotente con la misma clave', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);
    const key = `${f.tag}:assign-idempotent`;

    const command = {
      shipmentId: shipment.id,
      expectedVersion: 0,
      actorId: f.admin.id,
      modalidad: 'INTERNO' as const,
      vehiculoId: f.vehiculo.id,
      conductorId: f.conductor.id,
      responsableId: f.repartidor.id,
      claveIdempotencia: key,
    };

    await workflow.assignResources(command);
    await workflow.assignResources(command);

    const envio = await prisma.envio.findUniqueOrThrow({
      where: {
        id: shipment.id,
      },
    });

    const events = await prisma.envioEvento.count({
      where: {
        envioId: shipment.id,
        claveIdempotencia: key,
      },
    });

    expect(envio.estado).toBe('ASIGNADO');
    expect(envio.version).toBe(1);
    expect(events).toBe(1);
  });

  it('un expectedVersion obsoleto hace rollback también de la reserva de recursos', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await prisma.envio.update({
      where: {
        id: shipment.id,
      },
      data: {
        version: {
          increment: 1,
        },
      },
    });

    await expect(
      workflow.assignResources({
        shipmentId: shipment.id,
        expectedVersion: 0,
        actorId: f.admin.id,
        modalidad: 'INTERNO',
        vehiculoId: f.vehiculo.id,
        conductorId: f.conductor.id,
        responsableId: f.repartidor.id,
        claveIdempotencia: `${f.tag}:stale-version`,
      }),
    ).rejects.toBeInstanceOf(TransportConcurrentModificationError);

    const [envio, vehiculo, conductor] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: {
          id: shipment.id,
        },
      }),
      prisma.vehiculo.findUniqueOrThrow({
        where: {
          id: f.vehiculo.id,
        },
      }),
      prisma.conductor.findUniqueOrThrow({
        where: {
          id: f.conductor.id,
        },
      }),
    ]);

    expect(envio.estado).toBe('PROGRAMADO');
    expect(envio.version).toBe(1);
    expect(vehiculo.estado).toBe('DISPONIBLE');
    expect(conductor.estado).toBe('DISPONIBLE');
  });

  it('impide reservar el mismo vehículo y conductor para dos envíos activos', async () => {
    const f = fixture!;

    const first = await createInternalShipment(
      prisma,
      workflow,
      f,
      { dispatchIndexes: [0] },
    );

    const second = await createInternalShipment(
      prisma,
      workflow,
      f,
      { dispatchIndexes: [1] },
    );

    await assignInternalShipment(
      prisma,
      workflow,
      f,
      first.id,
      `${f.tag}:assign-first`,
    );

    await expect(
      workflow.assignResources({
        shipmentId: second.id,
        expectedVersion: 0,
        actorId: f.admin.id,
        modalidad: 'INTERNO',
        vehiculoId: f.vehiculo.id,
        conductorId: f.conductor.id,
        responsableId: f.repartidor.id,
        claveIdempotencia: `${f.tag}:assign-second`,
      }),
    ).rejects.toBeInstanceOf(TransportConcurrentModificationError);

    const secondRow = await prisma.envio.findUniqueOrThrow({
      where: {
        id: second.id,
      },
    });

    expect(secondRow.estado).toBe('PROGRAMADO');
    expect(secondRow.vehiculoId).toBeNull();
    expect(secondRow.conductorId).toBeNull();
  });

  it('asigna transportista externo sin reservar vehículo ni conductor', async () => {
    const f = fixture!;
    const shipment = await createExternalShipment(
      prisma,
      workflow,
      f,
    );

    await workflow.assignResources({
      shipmentId: shipment.id,
      expectedVersion: shipment.row.version,
      actorId: f.admin.id,
      modalidad: 'EXTERNO',
      transportistaId: f.transportistaExterno.id,
      claveIdempotencia: `${f.tag}:external-assign`,
    });

    const row = await prisma.envio.findUniqueOrThrow({
      where: {
        id: shipment.id,
      },
    });

    expect(row.estado).toBe('ASIGNADO');
    expect(row.transportistaId).toBe(f.transportistaExterno.id);
    expect(row.vehiculoId).toBeNull();
    expect(row.conductorId).toBeNull();
  });

  it('confirma la carga y mueve ASIGNADO -> CARGADO', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    await assignInternalShipment(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:assign-load`,
    );

    const load = await prisma.envioCargaDetalle.findFirstOrThrow({
      where: {
        envioDespacho: {
          envioId: shipment.id,
        },
      },
    });

    await workflow.confirmLoad({
      shipmentId: shipment.id,
      expectedVersion: 1,
      actorId: f.admin.id,
      claveIdempotencia: `${f.tag}:confirm-load`,
      lineas: [
        {
          cargaDetalleId: load.id,
          cantidadCargada: 6,
        },
      ],
    });

    const [envio, updatedLoad] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: {
          id: shipment.id,
        },
      }),
      prisma.envioCargaDetalle.findUniqueOrThrow({
        where: {
          id: load.id,
        },
      }),
    ]);

    expect(envio.estado).toBe('CARGADO');
    expect(envio.version).toBe(2);
    expect(envio.cargaConfirmadaPorId).toBe(f.admin.id);
    expect(updatedLoad.cantidadCargada).toBe(6);
    expect(updatedLoad.version).toBe(1);
  });

  it('una carga inválida hace rollback y mantiene ASIGNADO', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    await assignInternalShipment(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:assign-invalid-load`,
    );

    const load = await prisma.envioCargaDetalle.findFirstOrThrow({
      where: {
        envioDespacho: {
          envioId: shipment.id,
        },
      },
    });

    await expect(
      workflow.confirmLoad({
        shipmentId: shipment.id,
        expectedVersion: 1,
        actorId: f.admin.id,
        claveIdempotencia: `${f.tag}:invalid-load`,
        lineas: [
          {
            cargaDetalleId: load.id,
            cantidadCargada: 7,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(TransportQuantityExceededError);

    const [envio, unchangedLoad] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: {
          id: shipment.id,
        },
      }),
      prisma.envioCargaDetalle.findUniqueOrThrow({
        where: {
          id: load.id,
        },
      }),
    ]);

    expect(envio.estado).toBe('ASIGNADO');
    expect(envio.version).toBe(1);
    expect(unchangedLoad.cantidadCargada).toBe(0);
    expect(unchangedLoad.version).toBe(0);
  });

  it('inicia ruta y mueve envío, paradas, vehículo y conductor a EN_RUTA', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await assignInternalShipment(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:assign-route`,
    );

    await confirmFullLoad(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:confirm-route`,
    );

    await startInternalRoute(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:start-route`,
    );

    const [envio, stops, vehiculo, conductor, event] =
      await Promise.all([
        prisma.envio.findUniqueOrThrow({
          where: {
            id: shipment.id,
          },
        }),

        prisma.envioDespacho.findMany({
          where: {
            envioId: shipment.id,
          },
        }),

        prisma.vehiculo.findUniqueOrThrow({
          where: {
            id: f.vehiculo.id,
          },
        }),

        prisma.conductor.findUniqueOrThrow({
          where: {
            id: f.conductor.id,
          },
        }),

        prisma.envioEvento.findUniqueOrThrow({
          where: {
            claveIdempotencia: `${f.tag}:start-route`,
          },
        }),
      ]);

    expect(envio.estado).toBe('EN_RUTA');
    expect(envio.version).toBe(3);
    expect(envio.salidaEn).not.toBeNull();

    expect(stops.every((stop) => stop.estado === 'EN_RUTA')).toBe(true);
    expect(vehiculo.estado).toBe('EN_RUTA');
    expect(conductor.estado).toBe('EN_RUTA');

    expect(Number(event.latitud)).toBeCloseTo(15.6666667, 6);
    expect(Number(event.longitud)).toBeCloseTo(-91.7111111, 6);
  });

  it('cancelar un envío ASIGNADO libera recursos y cancela sus paradas', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await assignInternalShipment(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:assign-cancel`,
    );

    await workflow.cancelShipment({
      shipmentId: shipment.id,
      expectedVersion: 1,
      actorId: f.admin.id,
      motivo: 'Cancelación de integración',
      claveIdempotencia: `${f.tag}:cancel`,
    });

    const [envio, stops, vehiculo, conductor] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: {
          id: shipment.id,
        },
      }),

      prisma.envioDespacho.findMany({
        where: {
          envioId: shipment.id,
        },
      }),

      prisma.vehiculo.findUniqueOrThrow({
        where: {
          id: f.vehiculo.id,
        },
      }),

      prisma.conductor.findUniqueOrThrow({
        where: {
          id: f.conductor.id,
        },
      }),
    ]);

    expect(envio.estado).toBe('CANCELADO');
    expect(envio.canceladoPorId).toBe(f.admin.id);
    expect(envio.motivoCancelacion).toBe('Cancelación de integración');

    expect(stops.every((stop) => stop.estado === 'CANCELADA')).toBe(true);
    expect(vehiculo.estado).toBe('DISPONIBLE');
    expect(conductor.estado).toBe('DISPONIBLE');
  });

  it('reporta una incidencia de forma idempotente y la resuelve regresando a EN_RUTA', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await assignInternalShipment(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:assign-incident`,
    );

    await confirmFullLoad(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:confirm-incident`,
    );

    await startInternalRoute(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:route-incident`,
    );

    const incidentKey = `${f.tag}:incident`;

    const first = await workflow.reportIncident({
      shipmentId: shipment.id,
      actorId: f.repartidor.id,
      tipo: 'TRAFICO',
      severidad: 'MEDIA',
      descripcion: 'Tráfico de integración',
      latitud: 15.67,
      longitud: -91.71,
      claveIdempotencia: incidentKey,
    });

    const repeated = await workflow.reportIncident({
      shipmentId: shipment.id,
      actorId: f.repartidor.id,
      tipo: 'TRAFICO',
      severidad: 'MEDIA',
      descripcion: 'Tráfico de integración',
      claveIdempotencia: incidentKey,
    });

    expect(repeated.id).toBe(first.id);

    let envio = await prisma.envio.findUniqueOrThrow({
      where: {
        id: shipment.id,
      },
    });

    expect(envio.estado).toBe('INCIDENCIA');

    const count = await prisma.envioIncidencia.count({
      where: {
        envioId: shipment.id,
        claveIdempotencia: incidentKey,
      },
    });

    expect(count).toBe(1);

    await workflow.resolveIncident({
      shipmentId: shipment.id,
      incidentId: first.id,
      actorId: f.repartidor.id,
      resolucion: 'Ruta despejada',
      claveIdempotencia: `${f.tag}:resolve-incident`,
    });

    const incident = await prisma.envioIncidencia.findUniqueOrThrow({
      where: {
        id: first.id,
      },
    });

    envio = await prisma.envio.findUniqueOrThrow({
      where: {
        id: shipment.id,
      },
    });

    expect(incident.estado).toBe('RESUELTA');
    expect(incident.resolucion).toBe('Ruta despejada');
    expect(incident.resueltaEn).not.toBeNull();
    expect(envio.estado).toBe('EN_RUTA');
  });

  it('TransportDirectory expone la parada exacta con su snapshot y carga', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    const stop = shipment.row.despachos[0];
    const result = await directory.findStopById(stop.id);

    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        envioId: shipment.id,
        envioNumero: shipment.numero,
        envioEstado: 'PROGRAMADO',
        envioDespachoId: stop.id,
        ordenDespachoId: f.dispatches[0].orden.id,
        clienteId: f.cliente.id,
        secuencia: 1,
      }),
    );

    expect(result!.destino).toEqual(
      expect.objectContaining({
        direccion: f.cliente.direccion,
        latitud: 15.6666667,
        longitud: -91.7111111,
      }),
    );

    expect(result!.carga).toEqual([
      expect.objectContaining({
        ordenDespachoDetalleId: f.dispatches[0].detalle.id,
        productoId: f.producto.id,
        cantidadCargada: 0,
      }),
    ]);
  });

  it('DeliveryGate deja ENTREGADO_PARCIAL en la primera parada y COMPLETADO en la última', async () => {
    const f = fixture!;

    const shipment = await createInternalShipment(
      prisma,
      workflow,
      f,
      {
        dispatchIndexes: [0, 1],
        cantidadPlanificada: 10,
      },
    );

    await assignInternalShipment(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:assign-delivery`,
    );

    await confirmFullLoad(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:confirm-delivery`,
    );

    await startInternalRoute(
      prisma,
      workflow,
      f,
      shipment.id,
      `${f.tag}:route-delivery`,
    );

    const stops = await prisma.envioDespacho.findMany({
      where: {
        envioId: shipment.id,
      },
      orderBy: {
        secuencia: 'asc',
      },
    });

    await deliveryGate.markStopResult({
      envioDespachoId: stops[0].id,
      actorId: f.repartidor.id,
      resultado: 'ENTREGADA',
      detalle: 'Primera parada entregada',
      claveIdempotencia: `${f.tag}:delivery-1`,
    });

    let envio = await prisma.envio.findUniqueOrThrow({
      where: {
        id: shipment.id,
      },
    });

    expect(envio.estado).toBe('ENTREGADO_PARCIAL');

    await deliveryGate.markStopResult({
      envioDespachoId: stops[1].id,
      actorId: f.repartidor.id,
      resultado: 'ENTREGADA',
      detalle: 'Última parada entregada',
      claveIdempotencia: `${f.tag}:delivery-2`,
    });

    const [finalShipment, finalStops, vehiculo, conductor] =
      await Promise.all([
        prisma.envio.findUniqueOrThrow({
          where: {
            id: shipment.id,
          },
        }),

        prisma.envioDespacho.findMany({
          where: {
            envioId: shipment.id,
          },
          orderBy: {
            secuencia: 'asc',
          },
        }),

        prisma.vehiculo.findUniqueOrThrow({
          where: {
            id: f.vehiculo.id,
          },
        }),

        prisma.conductor.findUniqueOrThrow({
          where: {
            id: f.conductor.id,
          },
        }),
      ]);

    expect(finalShipment.estado).toBe('COMPLETADO');
    expect(finalShipment.completadoEn).not.toBeNull();
    expect(finalShipment.completadoPorId).toBe(f.repartidor.id);
    expect(finalStops.every((stop) => stop.estado === 'ATENDIDA')).toBe(true);
    expect(vehiculo.estado).toBe('DISPONIBLE');
    expect(conductor.estado).toBe('DISPONIBLE');
  });
});
