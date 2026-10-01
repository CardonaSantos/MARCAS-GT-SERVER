import { PrismaClient } from '@prisma/client';
import { TransportPrismaQueryAdapter } from '../../src/modules/transporte/infrastructure/persistence/prisma/transport.prisma-query.adapter';
import { TransportWorkflowPrismaAdapter } from '../../src/modules/transporte/infrastructure/persistence/prisma/transport-workflow.prisma-adapter';
import { createIntegrationPrisma } from './integration-db';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
  TransportIntegrationFixture,
} from './transport-fixture';
import { createInternalShipment } from './transport-test-helpers';

describe('Transporte read-side / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: TransportIntegrationFixture | null = null;
  let workflow: TransportWorkflowPrismaAdapter;
  let query: TransportPrismaQueryAdapter;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();

    workflow = new TransportWorkflowPrismaAdapter(prisma as any);
    query = new TransportPrismaQueryAdapter(prisma as any);
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

  it('listShipments lee progreso real desde paradas/cargas', async () => {
    const f = fixture!;

    await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    const result = await query.listShipments({
      page: 1,
      limit: 20,
      sortBy: 'creadoEn',
      sortDir: 'desc',
      scope: {
        empresaId: f.empresa.id,
        rol: 'ADMIN',
      },
    });

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);

    expect(result.data[0].progreso).toEqual({
      paradas: 1,
      paradasAtendidas: 0,
      unidadesPlanificadas: 6,
      unidadesCargadas: 0,
    });

    expect(result.data[0].incidenciasAbiertas).toBe(0);
    expect(result.data[0].advertencias).toEqual([]);
  });

  it('listCandidates descuenta cantidad ya planificada por otros viajes activos', async () => {
    const f = fixture!;

    await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    const result = await query.listCandidates({
      page: 1,
      limit: 20,
      bodegaId: f.bodega.id,
      clienteId: f.cliente.id,
      scope: {
        empresaId: f.empresa.id,
        rol: 'ADMIN',
      },
    });

    const candidate = result.data.find(
      (item: any) =>
        item.despacho.id === f.dispatches[0].orden.id,
    );

    expect(candidate).toBeDefined();

    const line = candidate.lineas.find(
      (item: any) =>
        item.ordenDespachoDetalleId ===
        f.dispatches[0].detalle.id,
    );

    expect(line).toEqual(
      expect.objectContaining({
        cantidadPreparada: 10,
        cantidadDespachada: 10,
        cantidadYaPlanificada: 6,
        cantidadYaCargada: 0,
        cantidadPlanificable: 4,
        cantidadCargable: 10,
      }),
    );
  });

  it('getShipment devuelve snapshot enriquecido desde PostgreSQL real', async () => {
    const f = fixture!;

    const shipment = await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 8 },
    );

    const result = await query.getShipment(
      shipment.id,
      {
        empresaId: f.empresa.id,
        rol: 'ADMIN',
      },
    );

    expect(result).not.toBeNull();

    expect(result).toEqual(
      expect.objectContaining({
        id: shipment.id,
        numero: shipment.numero,
        estado: 'PROGRAMADO',
        modalidad: 'INTERNO',
        progreso: {
          paradas: 1,
          paradasAtendidas: 0,
          unidadesPlanificadas: 8,
          unidadesCargadas: 0,
        },
      }),
    );

    expect(result.paradas[0]).toEqual(
      expect.objectContaining({
        ordenDespacho: expect.objectContaining({
          id: f.dispatches[0].orden.id,
        }),
        cliente: expect.objectContaining({
          id: f.cliente.id,
        }),
      }),
    );
  });

  it('scope VENDEDOR ve viajes de sus pedidos y oculta los de otro vendedor', async () => {
    const f = fixture!;

    const shipment = await createInternalShipment(
      prisma,
      workflow,
      f,
    );

    const own = await query.getShipmentState(
      shipment.id,
      {
        empresaId: f.empresa.id,
        rol: 'VENDEDOR',
        vendedorId: f.vendedor.id,
      },
    );

    const other = await query.getShipmentState(
      shipment.id,
      {
        empresaId: f.empresa.id,
        rol: 'VENDEDOR',
        vendedorId: f.otroVendedor.id,
      },
    );

    expect(own?.id).toBe(shipment.id);
    expect(other).toBeNull();
  });

  it('getSummary agrega unidades y estados sobre datos reales', async () => {
    const f = fixture!;

    await createInternalShipment(
      prisma,
      workflow,
      f,
      { cantidadPlanificada: 6 },
    );

    const summary = await query.getSummary({
      empresaId: f.empresa.id,
      rol: 'ADMIN',
    });

    expect(summary.total).toBe(1);
    expect(summary.porEstado.PROGRAMADO).toBe(1);
    expect(summary.abiertas).toBe(1);
    expect(summary.unidades).toEqual({
      planificadas: 6,
      cargadas: 0,
    });
    expect(summary.incidenciasAbiertas).toBe(0);
  });
});
