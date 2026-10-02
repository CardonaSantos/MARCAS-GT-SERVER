import { PrismaClient } from '@prisma/client';
import { createIntegrationPrisma } from '../transporte-integration/integration-db';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
  TransportIntegrationFixture,
} from '../transporte-integration/transport-fixture';

describe('Entregas constraints / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: TransportIntegrationFixture | null = null;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    fixture = await createTransportIntegrationFixture(prisma);
  });

  afterEach(async () => {
    if (!fixture) return;
    await prisma.entrega.deleteMany({ where: { pedidoId: fixture.pedido.id } });
    await cleanupTransportIntegrationFixture(prisma, fixture);
    fixture = null;
  });

  afterAll(async () => prisma.$disconnect());

  async function createDelivery() {
    const f = fixture!;
    return prisma.entrega.create({
      data: {
        ordenDespachoId: f.dispatches[0].orden.id,
        pedidoId: f.pedido.id,
        clienteId: f.cliente.id,
        registradoPorId: f.repartidor.id,
        estado: 'PENDIENTE',
        claveIdempotencia: `${f.tag}:constraint:delivery`,
        detalles: {
          create: {
            ordenDespachoDetalleId: f.dispatches[0].detalle.id,
            pedidoDetalleId: f.pedidoDetalle.id,
            productoId: f.producto.id,
            cantidadEntregada: 0,
            cantidadRechazada: 0,
          },
        },
      },
      include: { detalles: true },
    });
  }

  it('CHECK rechaza versión negativa', async () => {
    const delivery = await createDelivery();
    await expect(prisma.entrega.update({
      where: { id: delivery.id },
      data: { version: -1 },
    })).rejects.toThrow();
  });

  it('CHECK rechaza latitud fuera de rango', async () => {
    const delivery = await createDelivery();
    await expect(prisma.entrega.update({
      where: { id: delivery.id },
      data: { latitud: 91, longitud: -91 },
    })).rejects.toThrow();
  });

  it('CHECK exige par de coordenadas consistente', async () => {
    const delivery = await createDelivery();
    await expect(prisma.entrega.update({
      where: { id: delivery.id },
      data: { latitud: 15, longitud: null },
    })).rejects.toThrow();
  });

  it('CHECK rechaza cantidad entregada negativa', async () => {
    const delivery = await createDelivery();
    await expect(prisma.entregaDetalle.update({
      where: { id: delivery.detalles[0].id },
      data: { cantidadEntregada: -1 },
    })).rejects.toThrow();
  });

  it('UNIQUE protege clave de idempotencia de Entrega', async () => {
    const delivery = await createDelivery();
    await expect(prisma.entrega.create({
      data: {
        ordenDespachoId: fixture!.dispatches[1].orden.id,
        pedidoId: fixture!.pedido.id,
        clienteId: fixture!.cliente.id,
        estado: 'PENDIENTE',
        claveIdempotencia: delivery.claveIdempotencia,
      },
    })).rejects.toThrow();
  });

  it('CHECK rechaza clave de idempotencia vacía en evidencia', async () => {
    const delivery = await createDelivery();
    await expect(prisma.entregaEvidencia.create({
      data: {
        entregaId: delivery.id,
        tipo: 'FOTO',
        url: 'https://example.test/foto.jpg',
        claveIdempotencia: '   ',
      },
    })).rejects.toThrow();
  });
});
