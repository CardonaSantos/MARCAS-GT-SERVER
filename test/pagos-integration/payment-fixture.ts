import { PrismaClient } from '@prisma/client';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
} from '../transporte-integration/transport-fixture';

export type PaymentIntegrationFixture = Awaited<
  ReturnType<typeof createPaymentIntegrationFixture>
>;

export async function createPaymentIntegrationFixture(
  prisma: PrismaClient,
) {
  const base = await createTransportIntegrationFixture(prisma);

  const contabilidad = await prisma.usuario.create({
    data: {
      nombre: `Contabilidad ${base.tag}`,
      correo: `${base.tag}-payments@integration.test`,
      contrasena: 'integration-only',
      rol: 'CONTABILIDAD',
      activo: true,
      empresaId: base.empresa.id,
    },
  });

  const banco = await prisma.banco.create({
    data: {
      empresaId: base.empresa.id,
      nombre: `Banco Integración ${base.tag}`,
      codigo: `BNK-${base.tag.slice(-12)}`,
      cuenta: '001-TEST',
      activo: true,
    },
  });

  await prisma.pedido.update({
    where: { id: base.pedido.id },
    data: {
      condicionPago: 'MIXTO',
      estadoPago: 'PENDIENTE',
      subtotal: 1000,
      descuentoTotal: 0,
      total: 1000,
    },
  });

  const credito = await prisma.credito.create({
    data: {
      numero: `CRED-PAY-${base.tag}`,
      empresaId: base.empresa.id,
      clienteId: base.cliente.id,
      montoAutorizado: 1000,
      anticipoRequerido: 200,
      montoFinanciado: 800,
      plazoAutorizadoDias: 30,
      aprobadoPorId: base.admin.id,
      aprobadoEn: new Date(),
      estado: 'ACTIVO',
    },
  });

  const fechaVencimiento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const cuentaA = await prisma.cuentaPorCobrar.create({
    data: {
      empresaId: base.empresa.id,
      clienteId: base.cliente.id,
      pedidoId: base.pedido.id,
      creditoId: credito.id,
      numeroDocumento: `CXC-A-${base.tag}`,
      moneda: 'GTQ',
      montoOriginal: 600,
      saldoPendiente: 600,
      fechaVencimiento,
      estado: 'PENDIENTE',
      claveIdempotencia: `${base.tag}:payment:cxc:a`,
    },
  });

  const cuentaB = await prisma.cuentaPorCobrar.create({
    data: {
      empresaId: base.empresa.id,
      clienteId: base.cliente.id,
      pedidoId: base.pedido.id,
      creditoId: credito.id,
      numeroDocumento: `CXC-B-${base.tag}`,
      moneda: 'GTQ',
      montoOriginal: 400,
      saldoPendiente: 400,
      fechaVencimiento,
      estado: 'PENDIENTE',
      claveIdempotencia: `${base.tag}:payment:cxc:b`,
    },
  });

  const otroCliente = await prisma.cliente.create({
    data: {
      nombre: 'Cliente ajeno',
      apellido: base.tag,
      telefono: '55553333',
      direccion: 'Dirección cliente ajeno integración',
      categoriasInteres: [],
    },
  });

  const cuentaOtroCliente = await prisma.cuentaPorCobrar.create({
    data: {
      empresaId: base.empresa.id,
      clienteId: otroCliente.id,
      numeroDocumento: `CXC-OTHER-${base.tag}`,
      moneda: 'GTQ',
      montoOriginal: 100,
      saldoPendiente: 100,
      fechaVencimiento,
      estado: 'PENDIENTE',
      claveIdempotencia: `${base.tag}:payment:cxc:other-client`,
    },
  });

  const cuentaUsd = await prisma.cuentaPorCobrar.create({
    data: {
      empresaId: base.empresa.id,
      clienteId: base.cliente.id,
      pedidoId: base.pedido.id,
      numeroDocumento: `CXC-USD-${base.tag}`,
      moneda: 'USD',
      montoOriginal: 100,
      saldoPendiente: 100,
      fechaVencimiento,
      estado: 'PENDIENTE',
      claveIdempotencia: `${base.tag}:payment:cxc:usd`,
    },
  });

  return {
    base,
    contabilidad,
    banco,
    credito,
    cuentas: {
      a: cuentaA,
      b: cuentaB,
      otroCliente: cuentaOtroCliente,
      usd: cuentaUsd,
    },
    otroCliente,
  };
}

export async function cleanupPaymentIntegrationFixture(
  prisma: PrismaClient,
  fixture: PaymentIntegrationFixture,
): Promise<void> {
  const empresaId = fixture.base.empresa.id;

  const payments = await prisma.pago.findMany({
    where: { empresaId },
    select: { id: true },
  });

  const paymentIds = payments.map((row) => row.id);

  if (paymentIds.length) {
    await prisma.pagoAplicacion.deleteMany({
      where: { pagoId: { in: paymentIds } },
    });

    await prisma.pago.deleteMany({
      where: { id: { in: paymentIds } },
    });
  }

  await prisma.cuentaPorCobrar.deleteMany({
    where: { empresaId },
  });

  await prisma.credito.deleteMany({
    where: { id: fixture.credito.id },
  });

  await prisma.banco.deleteMany({
    where: { empresaId },
  });

  await prisma.cliente.deleteMany({
    where: { id: fixture.otroCliente.id },
  });

  await cleanupTransportIntegrationFixture(prisma, fixture.base);
}
