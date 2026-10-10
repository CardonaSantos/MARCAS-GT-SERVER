import { PrismaClient } from '@prisma/client';
import { TransportWorkflowPrismaAdapter } from '../../src/modules/transporte/infrastructure/persistence/prisma/transport-workflow.prisma-adapter';
import { TransportIntegrationFixture } from './transport-fixture';

export async function createInternalShipment(
  prisma: PrismaClient,
  workflow: TransportWorkflowPrismaAdapter,
  fixture: TransportIntegrationFixture,
  options: {
    dispatchIndexes?: readonly number[];
    cantidadPlanificada?: number;
  } = {},
) {
  const indexes = options.dispatchIndexes ?? [0];
  const cantidadPlanificada = options.cantidadPlanificada ?? 10;

  const created = await workflow.createShipment({
    empresaId: fixture.empresa.id,
    bodegaId: fixture.bodega.id,
    modalidad: 'INTERNO',
    creadoPorId: fixture.admin.id,
    salidaProgramadaEn: null,
    entregaEstimadaEn: null,
    observaciones: 'Integración Transporte',
    paradas: indexes.map((index, position) => {
      const source = fixture.dispatches[index];

      return {
        ordenDespachoId: source.orden.id,
        clienteId: fixture.cliente.id,
        secuencia: position + 1,
        destinatario: `${fixture.cliente.nombre} ${fixture.cliente.apellido ?? ''}`.trim(),
        telefonoDestino: fixture.cliente.telefono,
        direccionDestino: fixture.cliente.direccion,
        latitudDestino: 15.6666667,
        longitudDestino: -91.7111111,
        cargas: [
          {
            ordenDespachoDetalleId: source.detalle.id,
            productoId: fixture.producto.id,
            cantidadPlanificada,
          },
        ],
      };
    }),
  });

  const row = await prisma.envio.findUniqueOrThrow({
    where: {
      id: created.id,
    },
    include: {
      despachos: {
        orderBy: {
          secuencia: 'asc',
        },
        include: {
          cargas: true,
        },
      },
    },
  });

  return {
    ...created,
    row,
  };
}

export async function createExternalShipment(
  prisma: PrismaClient,
  workflow: TransportWorkflowPrismaAdapter,
  fixture: TransportIntegrationFixture,
) {
  const source = fixture.dispatches[0];

  const created = await workflow.createShipment({
    empresaId: fixture.empresa.id,
    bodegaId: fixture.bodega.id,
    modalidad: 'EXTERNO',
    creadoPorId: fixture.admin.id,
    guia: `GUIA-${fixture.tag}`,
    costo: 75,
    trackingUrl: 'https://example.test/tracking',
    paradas: [
      {
        ordenDespachoId: source.orden.id,
        clienteId: fixture.cliente.id,
        secuencia: 1,
        destinatario: fixture.cliente.nombre,
        telefonoDestino: fixture.cliente.telefono,
        direccionDestino: fixture.cliente.direccion,
        cargas: [
          {
            ordenDespachoDetalleId: source.detalle.id,
            productoId: fixture.producto.id,
            cantidadPlanificada: 10,
          },
        ],
      },
    ],
  });

  const row = await prisma.envio.findUniqueOrThrow({
    where: {
      id: created.id,
    },
  });

  return {
    ...created,
    row,
  };
}

export async function assignInternalShipment(
  prisma: PrismaClient,
  workflow: TransportWorkflowPrismaAdapter,
  fixture: TransportIntegrationFixture,
  shipmentId: number,
  key: string,
) {
  const shipment = await prisma.envio.findUniqueOrThrow({
    where: {
      id: shipmentId,
    },
    select: {
      version: true,
    },
  });

  await workflow.assignResources({
    shipmentId,
    expectedVersion: shipment.version,
    actorId: fixture.admin.id,
    modalidad: 'INTERNO',
    vehiculoId: fixture.vehiculo.id,
    conductorId: fixture.conductor.id,
    responsableId: fixture.repartidor.id,
    claveIdempotencia: key,
  });
}

export async function confirmFullLoad(
  prisma: PrismaClient,
  workflow: TransportWorkflowPrismaAdapter,
  fixture: TransportIntegrationFixture,
  shipmentId: number,
  key: string,
) {
  const shipment = await prisma.envio.findUniqueOrThrow({
    where: {
      id: shipmentId,
    },
    select: {
      version: true,
    },
  });

  const loads = await prisma.envioCargaDetalle.findMany({
    where: {
      envioDespacho: {
        envioId: shipmentId,
      },
    },
    orderBy: {
      id: 'asc',
    },
  });

  await workflow.confirmLoad({
    shipmentId,
    expectedVersion: shipment.version,
    actorId: fixture.admin.id,
    claveIdempotencia: key,
    lineas: loads.map((load) => ({
      cargaDetalleId: load.id,
      cantidadCargada: load.cantidadPlanificada,
    })),
  });
}

export async function startInternalRoute(
  prisma: PrismaClient,
  workflow: TransportWorkflowPrismaAdapter,
  fixture: TransportIntegrationFixture,
  shipmentId: number,
  key: string,
) {
  const shipment = await prisma.envio.findUniqueOrThrow({
    where: {
      id: shipmentId,
    },
    select: {
      version: true,
    },
  });

  await workflow.startRoute({
    shipmentId,
    expectedVersion: shipment.version,
    actorId: fixture.repartidor.id,
    claveIdempotencia: key,
    latitud: 15.6666667,
    longitud: -91.7111111,
  });
}
