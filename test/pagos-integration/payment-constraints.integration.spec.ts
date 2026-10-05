import { PrismaClient } from '@prisma/client';
import { createIntegrationPrisma } from '../transporte-integration/integration-db';
import {
  cleanupPaymentIntegrationFixture,
  createPaymentIntegrationFixture,
  PaymentIntegrationFixture,
} from './payment-fixture';

describe('Pagos constraints / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: PaymentIntegrationFixture | null = null;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    fixture = await createPaymentIntegrationFixture(prisma);
  });

  afterEach(async () => {
    if (!fixture) return;
    await cleanupPaymentIntegrationFixture(prisma, fixture);
    fixture = null;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function createPayment() {
    const f = fixture!;

    return prisma.pago.create({
      data: {
        empresaId: f.base.empresa.id,
        clienteId: f.base.cliente.id,
        registradoPorId: f.contabilidad.id,
        metodo: 'EFECTIVO',
        estado: 'PENDIENTE',
        moneda: 'GTQ',
        monto: 100,
        claveIdempotencia: `${f.base.tag}:constraint:payment`,
      },
    });
  }

  it('CHECK rechaza monto de Pago no positivo', async () => {
    const f = fixture!;

    await expect(
      prisma.pago.create({
        data: {
          empresaId: f.base.empresa.id,
          clienteId: f.base.cliente.id,
          registradoPorId: f.contabilidad.id,
          metodo: 'EFECTIVO',
          moneda: 'GTQ',
          monto: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza moneda vacía en Pago', async () => {
    const f = fixture!;

    await expect(
      prisma.pago.create({
        data: {
          empresaId: f.base.empresa.id,
          clienteId: f.base.cliente.id,
          registradoPorId: f.contabilidad.id,
          metodo: 'EFECTIVO',
          moneda: '   ',
          monto: 10,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK exige auditoría al crear Pago VERIFICADO', async () => {
    const f = fixture!;

    await expect(
      prisma.pago.create({
        data: {
          empresaId: f.base.empresa.id,
          clienteId: f.base.cliente.id,
          registradoPorId: f.contabilidad.id,
          metodo: 'EFECTIVO',
          estado: 'VERIFICADO',
          moneda: 'GTQ',
          monto: 10,
          verificadoEn: null,
          verificadoPorId: null,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK exige motivo y actor al crear Pago RECHAZADO', async () => {
    const f = fixture!;

    await expect(
      prisma.pago.create({
        data: {
          empresaId: f.base.empresa.id,
          clienteId: f.base.cliente.id,
          registradoPorId: f.contabilidad.id,
          metodo: 'EFECTIVO',
          estado: 'RECHAZADO',
          moneda: 'GTQ',
          monto: 10,
          rechazadoEn: new Date(),
          rechazadoPorId: f.contabilidad.id,
          motivoRechazo: '   ',
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK exige verificación previa y auditoría al crear Pago ANULADO', async () => {
    const f = fixture!;

    await expect(
      prisma.pago.create({
        data: {
          empresaId: f.base.empresa.id,
          clienteId: f.base.cliente.id,
          registradoPorId: f.contabilidad.id,
          metodo: 'EFECTIVO',
          estado: 'ANULADO',
          moneda: 'GTQ',
          monto: 10,
          anuladoEn: new Date(),
          anuladoPorId: f.contabilidad.id,
          motivoAnulacion: 'Corrección',
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza monto no positivo en PagoAplicacion', async () => {
    const f = fixture!;
    const payment = await createPayment();

    await expect(
      prisma.pagoAplicacion.create({
        data: {
          pagoId: payment.id,
          cuentaPorCobrarId: f.cuentas.a.id,
          monto: 0,
          aplicadoPorId: f.contabilidad.id,
          claveIdempotencia: `${f.base.tag}:constraint:application-zero`,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK exige auditoría completa para PagoAplicacion REVERSADA', async () => {
    const f = fixture!;
    const payment = await createPayment();

    await expect(
      prisma.pagoAplicacion.create({
        data: {
          pagoId: payment.id,
          cuentaPorCobrarId: f.cuentas.a.id,
          monto: 10,
          estado: 'REVERSADA',
          aplicadoPorId: f.contabilidad.id,
          revertidaEn: null,
          revertidaPorId: null,
          motivoReversion: null,
          claveIdempotencia: `${f.base.tag}:constraint:application-reversed`,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza claves de idempotencia vacías', async () => {
    const f = fixture!;
    const payment = await createPayment();

    await expect(
      prisma.pagoEvento.create({
        data: {
          pagoId: payment.id,
          usuarioId: f.contabilidad.id,
          tipo: 'OBSERVACION',
          estado: 'PENDIENTE',
          claveIdempotencia: '   ',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.pagoComprobante.create({
        data: {
          pagoId: payment.id,
          subidoPorId: f.contabilidad.id,
          url: 'https://example.test/proof.png',
          claveIdempotencia: '   ',
        },
      }),
    ).rejects.toThrow();
  });

  it('RESTRICT impide borrar una CxC con historia de aplicación', async () => {
    const f = fixture!;
    const payment = await createPayment();

    await prisma.pagoAplicacion.create({
      data: {
        pagoId: payment.id,
        cuentaPorCobrarId: f.cuentas.a.id,
        monto: 10,
        aplicadoPorId: f.contabilidad.id,
        claveIdempotencia: `${f.base.tag}:constraint:restrict`,
      },
    });

    await expect(
      prisma.cuentaPorCobrar.delete({
        where: { id: f.cuentas.a.id },
      }),
    ).rejects.toThrow();
  });
});
