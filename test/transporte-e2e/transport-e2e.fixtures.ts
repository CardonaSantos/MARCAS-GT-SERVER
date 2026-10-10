import { PrismaClient } from '@prisma/client';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
} from '../transporte-integration/transport-fixture';

let counter = 0;

export type TransportE2EFixture = Awaited<
  ReturnType<typeof createTransportE2EFixture>
>;

export async function createTransportE2EFixture(
  prisma: PrismaClient,
) {
  const base = await createTransportIntegrationFixture(prisma);
  const suffix = `${process.pid}-${Date.now()}-${++counter}`;

  const [contabilidad, repartidorOtro] = await Promise.all([
    prisma.usuario.create({
      data: {
        nombre: `E2E Contabilidad ${suffix}`,
        correo: `e2e-conta-${suffix}@test.local`,
        contrasena: 'e2e-only',
        rol: 'CONTABILIDAD',
        activo: true,
        empresaId: base.empresa.id,
      },
    }),
    prisma.usuario.create({
      data: {
        nombre: `E2E Repartidor Otro ${suffix}`,
        correo: `e2e-rep-otro-${suffix}@test.local`,
        contrasena: 'e2e-only',
        rol: 'REPARTIDOR',
        activo: true,
        empresaId: base.empresa.id,
      },
    }),
  ]);

  // La primera orden queda parcialmente despachada: preparada 10, salida física 8.
  // Esto permite verificar en E2E que Transporte no pueda cargar 10 entre dos viajes.
  const mainDispatchOrder = await prisma.ordenDespacho.update({
    where: { id: base.dispatches[0].orden.id },
    data: { estado: 'PARCIALMENTE_DESPACHADA' },
  });

  const mainDispatchDetail = await prisma.ordenDespachoDetalle.update({
    where: { id: base.dispatches[0].detalle.id },
    data: { cantidadDespachada: 8 },
  });

  const pedidoOtro = await prisma.pedido.create({
    data: {
      numero: `E2E-PED-OTHER-${suffix}`,
      empresaId: base.empresa.id,
      clienteId: base.cliente.id,
      vendedorId: base.otroVendedor.id,
      estado: 'CONFIRMADO',
      condicionPago: 'PREPAGO',
      estadoPago: 'PAGADO',
      moneda: 'GTQ',
      subtotal: 50,
      descuentoTotal: 0,
      total: 50,
      detalles: {
        create: {
          productoId: base.producto.id,
          cantidadSolicitada: 5,
          cantidadReservada: 0,
          cantidadDespachada: 5,
          cantidadEntregada: 0,
          precioUnitario: 10,
          descuento: 0,
          subtotal: 50,
        },
      },
    },
    include: {
      detalles: true,
    },
  });

  const otherDispatchOrder = await prisma.ordenDespacho.create({
    data: {
      pedidoId: pedidoOtro.id,
      bodegaId: base.bodega.id,
      numero: `E2E-DSP-OTHER-${suffix}`,
      estado: 'DESPACHADA',
      creadoPorId: base.admin.id,
      preparadoPorId: base.bodegaUser.id,
      despachadoPorId: base.bodegaUser.id,
      programadoEn: new Date(),
      preparacionIniciadaEn: new Date(),
      preparadoEn: new Date(),
      despachadoEn: new Date(),
    },
  });

  const otherDispatchDetail = await prisma.ordenDespachoDetalle.create({
    data: {
      ordenDespachoId: otherDispatchOrder.id,
      pedidoDetalleId: pedidoOtro.detalles[0].id,
      productoId: base.producto.id,
      cantidadProgramada: 5,
      cantidadPreparada: 5,
      cantidadDespachada: 5,
    },
  });

  return {
    ...base,
    baseFixture: base,
    suffix,
    contabilidad,
    repartidorOtro,
    mainDispatch: {
      orden: mainDispatchOrder,
      detalle: mainDispatchDetail,
    },
    secondDispatch: base.dispatches[1],
    pedidoOtro,
    otherDispatch: {
      orden: otherDispatchOrder,
      detalle: otherDispatchDetail,
    },
  };
}

export async function cleanupTransportE2EFixture(
  prisma: PrismaClient,
  fixture: TransportE2EFixture,
) {
  // Todos los envíos creados por la suite pertenecen a la empresa aislada.
  await prisma.envio.deleteMany({
    where: {
      empresaId: fixture.empresa.id,
    },
  });

  await prisma.ordenDespachoDetalle.deleteMany({
    where: {
      ordenDespachoId: fixture.otherDispatch.orden.id,
    },
  });

  await prisma.ordenDespacho.deleteMany({
    where: {
      id: fixture.otherDispatch.orden.id,
    },
  });

  await prisma.pedidoDetalle.deleteMany({
    where: {
      pedidoId: fixture.pedidoOtro.id,
    },
  });

  await prisma.pedido.deleteMany({
    where: {
      id: fixture.pedidoOtro.id,
    },
  });

  await cleanupTransportIntegrationFixture(
    prisma,
    fixture.baseFixture,
  );
}
