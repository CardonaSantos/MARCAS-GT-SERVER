import { PrismaClient } from '@prisma/client';
import { DeliveryPrismaRepository } from '../../src/modules/entregas/infrastructure/persistence/prisma/delivery.prisma-repository';
import { DeliveryActorDirectoryPrismaAdapter } from '../../src/modules/entregas/infrastructure/adapters/delivery-actor-directory.prisma-adapter';
import { CreateDeliveryUseCase } from '../../src/modules/entregas/application/use-cases/create-delivery.use-case';
import { StartDeliveryUseCase } from '../../src/modules/entregas/application/use-cases/start-delivery.use-case';
import { UpdateDeliveryResultUseCase } from '../../src/modules/entregas/application/use-cases/update-delivery-result.use-case';
import { FinalizeDeliveryUseCase } from '../../src/modules/entregas/application/use-cases/finalize-delivery.use-case';
import { DispatchDirectoryAdapter } from '../../src/modules/despachos/infrastructure/adapters/dispatch-directory.adapter';
import { OrderDeliveryGateAdapter } from '../../src/modules/pedidos/infrastructure/adapters/order-delivery-gate.adapter';
import { TransportDirectoryAdapter } from '../../src/modules/transporte/infrastructure/adapters/transport-directory.adapter';
import { TransportDeliveryGateAdapter } from '../../src/modules/transporte/infrastructure/adapters/transport-delivery-gate.adapter';
import { TransportWorkflowPrismaAdapter } from '../../src/modules/transporte/infrastructure/persistence/prisma/transport-workflow.prisma-adapter';
import { createIntegrationPrisma } from '../transporte-integration/integration-db';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
  TransportIntegrationFixture,
} from '../transporte-integration/transport-fixture';
import {
  assignInternalShipment,
  confirmFullLoad,
  createInternalShipment,
  startInternalRoute,
} from '../transporte-integration/transport-test-helpers';

describe('Entregas workflow / PostgreSQL integration', () => {
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
    if (!fixture) return;
    await prisma.entrega.deleteMany({
      where: { pedido: { empresaId: fixture.empresa.id } },
    });
    await cleanupTransportIntegrationFixture(prisma, fixture);
    fixture = null;
  });

  afterAll(async () => prisma.$disconnect());

  async function runningStop() {
    const f = fixture!;
    const shipment = await createInternalShipment(prisma, workflow, f, {
      dispatchIndexes: [0],
      cantidadPlanificada: 10,
    });
    await assignInternalShipment(prisma, workflow, f, shipment.id, `${f.tag}:assign`);
    await confirmFullLoad(prisma, workflow, f, shipment.id, `${f.tag}:load`);
    await startInternalRoute(prisma, workflow, f, shipment.id, `${f.tag}:route`);
    const stop = await prisma.envioDespacho.findFirstOrThrow({
      where: { envioId: shipment.id },
      include: { cargas: true },
    });
    return { shipment, stop };
  }

  function services() {
    const db: any = prisma;
    const repository = new DeliveryPrismaRepository(db);
    const actors = new DeliveryActorDirectoryPrismaAdapter(db);
    const transport = new TransportDirectoryAdapter(db);
    const dispatches = new DispatchDirectoryAdapter(db);
    const orderGate = new OrderDeliveryGateAdapter(db);
    const transportGate = new TransportDeliveryGateAdapter(db);
    return {
      repository, actors, transport, dispatches, orderGate, transportGate,
      create: new CreateDeliveryUseCase(repository, actors, transport, dispatches),
      start: new StartDeliveryUseCase(repository, actors, transport, dispatches),
      update: new UpdateDeliveryResultUseCase(repository, actors, transport, dispatches),
      finalize: new FinalizeDeliveryUseCase(repository, actors, transport, dispatches, orderGate, transportGate),
    };
  }

  it('recorre carga -> entrega -> pedido -> transporte sin duplicar cantidades', async () => {
    const f = fixture!;
    const { shipment, stop } = await runningStop();
    const s = services();

    const delivery = await s.create.execute({
      envioDespachoId: stop.id,
      claveIdempotencia: `${f.tag}:delivery:create`,
      actorId: f.repartidor.id,
    });

    await s.start.execute({
      id: delivery.id,
      claveIdempotencia: `${f.tag}:delivery:start`,
      actorId: f.repartidor.id,
      latitud: 15.6666667,
      longitud: -91.7111111,
    });

    const started = await s.repository.findById(delivery.id);
    await s.update.execute({
      id: delivery.id,
      actorId: f.repartidor.id,
      receptorNombre: 'Cliente integración',
      latitud: 15.6666667,
      longitud: -91.7111111,
      detalles: started!.detalles.map((x) => ({
        detalleId: x.id,
        cantidadEntregada: 10,
        cantidadRechazada: 0,
      })),
    });

    await s.repository.addEvidence({
      entregaId: delivery.id,
      tipo: 'FIRMA',
      url: 'https://example.test/firma.png',
      key: null,
      mimeType: 'image/png',
      size: 100,
      descripcion: 'Firma integración',
      claveIdempotencia: `${f.tag}:delivery:evidence`,
      actorId: f.repartidor.id,
    });

    const payload = {
      id: delivery.id,
      resultado: 'ENTREGADA' as const,
      receptorNombre: 'Cliente integración',
      latitud: 15.6666667,
      longitud: -91.7111111,
      claveIdempotencia: `${f.tag}:delivery:final`,
      actorId: f.repartidor.id,
    };

    await s.finalize.execute(payload);
    await s.finalize.execute(payload);

    const [saved, orderLine, order, savedStop, savedShipment] = await Promise.all([
      prisma.entrega.findUniqueOrThrow({ where: { id: delivery.id } }),
      prisma.pedidoDetalle.findUniqueOrThrow({ where: { id: f.pedidoDetalle.id } }),
      prisma.pedido.findUniqueOrThrow({ where: { id: f.pedido.id } }),
      prisma.envioDespacho.findUniqueOrThrow({ where: { id: stop.id } }),
      prisma.envio.findUniqueOrThrow({ where: { id: shipment.id } }),
    ]);

    expect(saved.estado).toBe('ENTREGADA');
    expect(orderLine.cantidadEntregada).toBe(10);
    expect(order.estado).toBe('PARCIALMENTE_ENTREGADO');
    expect(savedStop.estado).toBe('ATENDIDA');
    expect(savedShipment.estado).toBe('COMPLETADO');

    expect(await prisma.pedidoEvento.count({
      where: { pedidoId: f.pedido.id, referenciaTipo: 'ENTREGA', referenciaId: delivery.id },
    })).toBe(1);

    expect(await prisma.envioEvento.count({
      where: { envioId: shipment.id, claveIdempotencia: `${f.tag}:delivery:final:TRANSPORT` },
    })).toBe(1);
  });

  it('permite entrega parcial y conserva saldo pendiente en Pedido', async () => {
    const f = fixture!;
    const { stop } = await runningStop();
    const s = services();
    const delivery = await s.create.execute({
      envioDespachoId: stop.id,
      claveIdempotencia: `${f.tag}:partial:create`,
      actorId: f.repartidor.id,
    });
    await s.start.execute({
      id: delivery.id,
      claveIdempotencia: `${f.tag}:partial:start`,
      actorId: f.repartidor.id,
      latitud: 15.6666667,
      longitud: -91.7111111,
    });
    const row = await s.repository.findById(delivery.id);
    await s.update.execute({
      id: delivery.id,
      actorId: f.repartidor.id,
      receptorNombre: 'Cliente parcial',
      latitud: 15.6666667,
      longitud: -91.7111111,
      detalles: row!.detalles.map((x) => ({
        detalleId: x.id,
        cantidadEntregada: 7,
        cantidadRechazada: 3,
        motivoRechazo: 'Tres unidades rechazadas',
      })),
    });
    await s.repository.addEvidence({
      entregaId: delivery.id,
      tipo: 'FOTO',
      url: 'https://example.test/parcial.jpg',
      claveIdempotencia: `${f.tag}:partial:evidence`,
      actorId: f.repartidor.id,
    });
    await s.finalize.execute({
      id: delivery.id,
      resultado: 'PARCIAL',
      receptorNombre: 'Cliente parcial',
      latitud: 15.6666667,
      longitud: -91.7111111,
      claveIdempotencia: `${f.tag}:partial:final`,
      actorId: f.repartidor.id,
    });

    const detail = await prisma.pedidoDetalle.findUniqueOrThrow({ where: { id: f.pedidoDetalle.id } });
    expect(detail.cantidadEntregada).toBe(7);
  });
});
