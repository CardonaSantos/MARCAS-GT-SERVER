import { PrismaClient } from '@prisma/client';
import { TransportWorkflowPrismaAdapter } from '../../src/modules/transporte/infrastructure/persistence/prisma/transport-workflow.prisma-adapter';
import { createIntegrationPrisma } from './integration-db';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
  TransportIntegrationFixture,
} from './transport-fixture';
import { createInternalShipment } from './transport-test-helpers';

describe('Transporte constraints / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: TransportIntegrationFixture | null = null;
  let workflow: TransportWorkflowPrismaAdapter;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();
    workflow = new TransportWorkflowPrismaAdapter(prisma as any);
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

  it('CHECK rechaza costo negativo en Envio', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await expect(
      prisma.envio.update({
        where: {
          id: shipment.id,
        },
        data: {
          costo: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza numero vacío en Envio', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await expect(
      prisma.envio.update({
        where: {
          id: shipment.id,
        },
        data: {
          numero: '   ',
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza version negativa en Envio', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await expect(
      prisma.envio.update({
        where: {
          id: shipment.id,
        },
        data: {
          version: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza cantidadPlanificada <= 0', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    const load = await prisma.envioCargaDetalle.findFirstOrThrow({
      where: {
        envioDespacho: {
          envioId: shipment.id,
        },
      },
    });

    await expect(
      prisma.envioCargaDetalle.update({
        where: {
          id: load.id,
        },
        data: {
          cantidadPlanificada: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza cantidadCargada mayor que cantidadPlanificada', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    const load = await prisma.envioCargaDetalle.findFirstOrThrow({
      where: {
        envioDespacho: {
          envioId: shipment.id,
        },
      },
    });

    await expect(
      prisma.envioCargaDetalle.update({
        where: {
          id: load.id,
        },
        data: {
          cantidadCargada: 7,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza coordenadas inválidas en EnvioDespacho', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    const stop = shipment.row.despachos[0];

    await expect(
      prisma.envioDespacho.update({
        where: {
          id: stop.id,
        },
        data: {
          latitudDestino: 91,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.envioDespacho.update({
        where: {
          id: stop.id,
        },
        data: {
          longitudDestino: -181,
        },
      }),
    ).rejects.toThrow();
  });

  it('UNIQUE rechaza secuencia duplicada dentro del mismo Envio', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await expect(
      prisma.envioDespacho.create({
        data: {
          envioId: shipment.id,
          ordenDespachoId: f.dispatches[1].orden.id,
          clienteId: f.cliente.id,
          secuencia: 1,
          destinatario: f.cliente.nombre,
          telefonoDestino: f.cliente.telefono,
          direccionDestino: f.cliente.direccion,
          estado: 'PENDIENTE',
        },
      }),
    ).rejects.toThrow();
  });

  it('UNIQUE rechaza claveIdempotencia duplicada en EnvioEvento', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);
    const key = `${f.tag}:duplicate-event`;

    const data = {
      envioId: shipment.id,
      usuarioId: f.admin.id,
      tipo: 'OBSERVACION' as const,
      estado: 'PROGRAMADO' as const,
      descripcion: 'Evento de integración',
      claveIdempotencia: key,
    };

    await prisma.envioEvento.create({
      data,
    });

    await expect(
      prisma.envioEvento.create({
        data,
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza claveIdempotencia vacía en EnvioEvento', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await expect(
      prisma.envioEvento.create({
        data: {
          envioId: shipment.id,
          usuarioId: f.admin.id,
          tipo: 'OBSERVACION',
          estado: 'PROGRAMADO',
          descripcion: 'Evento inválido',
          claveIdempotencia: '   ',
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK exige resolución consistente cuando una incidencia está RESUELTA', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await expect(
      prisma.envioIncidencia.create({
        data: {
          envioId: shipment.id,
          tipo: 'TRAFICO',
          severidad: 'MEDIA',
          estado: 'RESUELTA',
          descripcion: 'Incidencia inconsistente',
          reportadaPorId: f.admin.id,
          claveIdempotencia: `${f.tag}:bad-resolved-incident`,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza capacidad negativa en Vehiculo', async () => {
    const f = fixture!;

    await expect(
      prisma.vehiculo.update({
        where: {
          id: f.vehiculo.id,
        },
        data: {
          capacidadKg: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it('FK rechaza una parada con cliente inexistente', async () => {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f);

    await expect(
      prisma.envioDespacho.create({
        data: {
          envioId: shipment.id,
          ordenDespachoId: f.dispatches[1].orden.id,
          clienteId: 2_147_000_000,
          secuencia: 2,
          destinatario: 'Cliente inexistente',
          direccionDestino: 'Dirección',
          estado: 'PENDIENTE',
        },
      }),
    ).rejects.toThrow();
  });
});
