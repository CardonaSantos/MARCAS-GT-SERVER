import { PrismaClient } from '@prisma/client';
import { AddPaymentProofUseCase } from '../../src/modules/pagos/application/use-cases/add-payment-proof.use-case';
import { ApplyPaymentUseCase } from '../../src/modules/pagos/application/use-cases/apply-payment.use-case';
import { RegisterPaymentUseCase } from '../../src/modules/pagos/application/use-cases/register-payment.use-case';
import { RejectPaymentUseCase } from '../../src/modules/pagos/application/use-cases/reject-payment.use-case';
import { ReversePaymentApplicationUseCase } from '../../src/modules/pagos/application/use-cases/reverse-payment-application.use-case';
import { VerifyPaymentUseCase } from '../../src/modules/pagos/application/use-cases/verify-payment.use-case';
import { VoidPaymentUseCase } from '../../src/modules/pagos/application/use-cases/void-payment.use-case';
import { PaymentActorDirectoryPrismaAdapter } from '../../src/modules/pagos/infrastructure/adapters/payment-actor-directory.prisma-adapter';
import { PaymentContextPrismaAdapter } from '../../src/modules/pagos/infrastructure/adapters/payment-context.prisma-adapter';
import { PaymentPrismaQueryAdapter } from '../../src/modules/pagos/infrastructure/persistence/prisma/payment.prisma-query.adapter';
import { PaymentWorkflowPrismaAdapter } from '../../src/modules/pagos/infrastructure/persistence/prisma/payment-workflow.prisma-adapter';
import { createIntegrationPrisma } from '../transporte-integration/integration-db';
import {
  cleanupPaymentIntegrationFixture,
  createPaymentIntegrationFixture,
  PaymentIntegrationFixture,
} from './payment-fixture';

describe('Pagos workflow / PostgreSQL integration', () => {
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

  function services() {
    const db: any = prisma;
    const workflow = new PaymentWorkflowPrismaAdapter(db);
    const actors = new PaymentActorDirectoryPrismaAdapter(db);
    const context = new PaymentContextPrismaAdapter(db);

    return {
      workflow,
      query: new PaymentPrismaQueryAdapter(db),
      register: new RegisterPaymentUseCase(workflow, actors, context),
      proof: new AddPaymentProofUseCase(workflow, actors, context),
      verify: new VerifyPaymentUseCase(workflow, actors),
      reject: new RejectPaymentUseCase(workflow, actors),
      apply: new ApplyPaymentUseCase(workflow, actors),
      reverse: new ReversePaymentApplicationUseCase(workflow, actors),
      voidPayment: new VoidPaymentUseCase(workflow, actors),
    };
  }

  it('registra pago y comprobante de forma idempotente con auditoría', async () => {
    const f = fixture!;
    const s = services();
    const key = `${f.base.tag}:payment:register`;

    const command = {
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      pedidoId: f.base.pedido.id,
      metodo: 'EFECTIVO' as const,
      moneda: 'GTQ',
      monto: '250.00',
      observaciones: 'Pago de integración',
      claveIdempotencia: key,
    };

    const first = await s.register.execute(command);
    const repeated = await s.register.execute(command);

    expect(repeated.id).toBe(first.id);
    expect(first.estado).toBe('PENDIENTE');
    expect(first.monto).toBe('250.00');

    const proofKey = `${f.base.tag}:payment:proof`;
    const proof = await s.proof.execute({
      id: first.id,
      actorId: f.contabilidad.id,
      url: 'https://example.test/comprobantes/pago.png',
      key: 'payments/test/pago.png',
      mimeType: 'image/png',
      size: 1024,
      descripcion: 'Comprobante integración',
      claveIdempotencia: proofKey,
    });
    const proofRepeated = await s.proof.execute({
      id: first.id,
      actorId: f.contabilidad.id,
      url: 'https://example.test/comprobantes/pago.png',
      key: 'payments/test/pago.png',
      mimeType: 'image/png',
      size: 1024,
      descripcion: 'Comprobante integración',
      claveIdempotencia: proofKey,
    });

    expect(proofRepeated.id).toBe(proof.id);

    expect(
      await prisma.pago.count({
        where: { claveIdempotencia: key },
      }),
    ).toBe(1);

    expect(
      await prisma.pagoComprobante.count({
        where: { claveIdempotencia: proofKey },
      }),
    ).toBe(1);

    expect(
      await prisma.pagoEvento.count({
        where: {
          pagoId: first.id,
          tipo: { in: ['CREADO', 'COMPROBANTE_AGREGADO'] },
        },
      }),
    ).toBe(2);
  });

  it('verifica anticipo MIXTO y sincroniza Pedido.estadoPago a PARCIAL', async () => {
    const f = fixture!;
    const s = services();

    const payment = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      pedidoId: f.base.pedido.id,
      metodo: 'EFECTIVO',
      monto: '200.00',
      claveIdempotencia: `${f.base.tag}:payment:mixed-advance`,
    });

    const verified = await s.verify.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:verify-mixed`,
    });

    const order = await prisma.pedido.findUniqueOrThrow({
      where: { id: f.base.pedido.id },
    });

    expect(verified.estado).toBe('VERIFICADO');
    expect(verified.verificadoPorId).toBe(f.contabilidad.id);
    expect(verified.verificadoEn).toBeInstanceOf(Date);
    expect(order.estadoPago).toBe('PARCIAL');

    expect(
      await prisma.pagoEvento.count({
        where: {
          pagoId: payment.id,
          tipo: 'VERIFICADO',
        },
      }),
    ).toBe(1);
  });

  it('PREPAGO queda PAGADO al verificar el total aun sin aplicar a CxC', async () => {
    const f = fixture!;
    const s = services();

    await prisma.pedido.update({
      where: { id: f.base.pedido.id },
      data: {
        condicionPago: 'PREPAGO',
        estadoPago: 'PENDIENTE',
        subtotal: 500,
        total: 500,
      },
    });

    const payment = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      pedidoId: f.base.pedido.id,
      metodo: 'EFECTIVO',
      monto: '500.00',
      claveIdempotencia: `${f.base.tag}:payment:prepaid`,
    });

    await s.verify.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:verify-prepaid`,
    });

    const order = await prisma.pedido.findUniqueOrThrow({
      where: { id: f.base.pedido.id },
    });

    const applications = await prisma.pagoAplicacion.count({
      where: { pagoId: payment.id },
    });

    expect(order.estadoPago).toBe('PAGADO');
    expect(applications).toBe(0);
  });

  it('rechaza un pago pendiente sin reconocerlo como ingreso válido', async () => {
    const f = fixture!;
    const s = services();

    const payment = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      bancoId: f.banco.id,
      metodo: 'TRANSFERENCIA_BANCO',
      monto: '150.00',
      referencia: `TRX-${f.base.tag}`,
      claveIdempotencia: `${f.base.tag}:payment:reject-source`,
    });

    const rejected = await s.reject.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      motivo: 'Transferencia no localizada en banco',
      claveIdempotencia: `${f.base.tag}:payment:reject`,
    });

    expect(rejected.estado).toBe('RECHAZADO');
    expect(rejected.rechazadoPorId).toBe(f.contabilidad.id);
    expect(rejected.motivoRechazo).toBe(
      'Transferencia no localizada en banco',
    );
  });

  it('aplica un pago general a varias CxC, deja remanente y cierra Crédito', async () => {
    const f = fixture!;
    const s = services();

    const payment = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      metodo: 'EFECTIVO',
      monto: '1200.00',
      claveIdempotencia: `${f.base.tag}:payment:general`,
    });

    await s.verify.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:verify-general`,
    });

    await s.apply.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      cuentaPorCobrarId: f.cuentas.a.id,
      monto: '600.00',
      claveIdempotencia: `${f.base.tag}:payment:apply-a`,
    });

    await s.apply.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      cuentaPorCobrarId: f.cuentas.b.id,
      monto: '400.00',
      claveIdempotencia: `${f.base.tag}:payment:apply-b`,
    });

    const [accountA, accountB, credit, order, directory] = await Promise.all([
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: f.cuentas.a.id },
      }),
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: f.cuentas.b.id },
      }),
      prisma.credito.findUniqueOrThrow({
        where: { id: f.credito.id },
      }),
      prisma.pedido.findUniqueOrThrow({
        where: { id: f.base.pedido.id },
      }),
      s.query.findById(payment.id),
    ]);

    expect(accountA.saldoPendiente.toFixed(2)).toBe('0.00');
    expect(accountA.estado).toBe('PAGADA');
    expect(accountB.saldoPendiente.toFixed(2)).toBe('0.00');
    expect(accountB.estado).toBe('PAGADA');

    expect(credit.estado).toBe('CERRADO');
    expect(credit.cerradoEn).toBeInstanceOf(Date);
    expect(order.estadoPago).toBe('PAGADO');

    expect(directory).toEqual(
      expect.objectContaining({
        monto: '1200.00',
        montoAplicado: '1000.00',
        montoDisponible: '200.00',
      }),
    );
  });

  it('revierte una aplicación, restaura CxC y reabre Crédito', async () => {
    const f = fixture!;
    const s = services();

    const payment = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      metodo: 'EFECTIVO',
      monto: '1000.00',
      claveIdempotencia: `${f.base.tag}:payment:reverse-source`,
    });

    await s.verify.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:reverse-verify`,
    });

    await s.apply.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      cuentaPorCobrarId: f.cuentas.a.id,
      monto: '600.00',
      claveIdempotencia: `${f.base.tag}:payment:reverse-apply-a`,
    });

    const applicationB = await s.apply.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      cuentaPorCobrarId: f.cuentas.b.id,
      monto: '400.00',
      claveIdempotencia: `${f.base.tag}:payment:reverse-apply-b`,
    });

    const reversed = await s.reverse.execute({
      pagoId: payment.id,
      aplicacionId: applicationB.id,
      actorId: f.contabilidad.id,
      motivo: 'Aplicación asignada a documento incorrecto',
      claveIdempotencia: `${f.base.tag}:payment:reverse-b`,
    });

    const repeated = await s.reverse.execute({
      pagoId: payment.id,
      aplicacionId: applicationB.id,
      actorId: f.contabilidad.id,
      motivo: 'Aplicación asignada a documento incorrecto',
      claveIdempotencia: `${f.base.tag}:payment:reverse-b`,
    });

    const [accountB, credit, order] = await Promise.all([
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: f.cuentas.b.id },
      }),
      prisma.credito.findUniqueOrThrow({
        where: { id: f.credito.id },
      }),
      prisma.pedido.findUniqueOrThrow({
        where: { id: f.base.pedido.id },
      }),
    ]);

    expect(reversed.estado).toBe('REVERSADA');
    expect(repeated.id).toBe(reversed.id);
    expect(accountB.saldoPendiente.toFixed(2)).toBe('400.00');
    expect(accountB.estado).toBe('PENDIENTE');
    expect(credit.estado).toBe('ACTIVO');
    expect(credit.cerradoEn).toBeNull();
    expect(order.estadoPago).toBe('PARCIAL');
  });

  it('anula pago verificado revirtiendo todas sus aplicaciones de forma atómica', async () => {
    const f = fixture!;
    const s = services();

    const payment = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      metodo: 'EFECTIVO',
      monto: '1000.00',
      claveIdempotencia: `${f.base.tag}:payment:void-source`,
    });

    await s.verify.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:void-verify`,
    });

    await s.apply.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      cuentaPorCobrarId: f.cuentas.a.id,
      monto: '600.00',
      claveIdempotencia: `${f.base.tag}:payment:void-apply-a`,
    });

    await s.apply.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      cuentaPorCobrarId: f.cuentas.b.id,
      monto: '400.00',
      claveIdempotencia: `${f.base.tag}:payment:void-apply-b`,
    });

    const voided = await s.voidPayment.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      motivo: 'Pago anulado durante prueba de integración',
      claveIdempotencia: `${f.base.tag}:payment:void`,
    });

    const [applications, accountA, accountB, credit, order] =
      await Promise.all([
        prisma.pagoAplicacion.findMany({
          where: { pagoId: payment.id },
        }),
        prisma.cuentaPorCobrar.findUniqueOrThrow({
          where: { id: f.cuentas.a.id },
        }),
        prisma.cuentaPorCobrar.findUniqueOrThrow({
          where: { id: f.cuentas.b.id },
        }),
        prisma.credito.findUniqueOrThrow({
          where: { id: f.credito.id },
        }),
        prisma.pedido.findUniqueOrThrow({
          where: { id: f.base.pedido.id },
        }),
      ]);

    expect(voided.estado).toBe('ANULADO');
    expect(applications).toHaveLength(2);
    expect(applications.every((row) => row.estado === 'REVERSADA')).toBe(true);
    expect(accountA.saldoPendiente.toFixed(2)).toBe('600.00');
    expect(accountB.saldoPendiente.toFixed(2)).toBe('400.00');
    expect(credit.estado).toBe('ACTIVO');
    expect(order.estadoPago).toBe('PENDIENTE');

    expect(
      await prisma.pagoEvento.count({
        where: {
          pagoId: payment.id,
          tipo: 'APLICACION_REVERTIDA',
        },
      }),
    ).toBe(2);
  });

  it('protege estado, cliente, moneda y límites financieros al aplicar', async () => {
    const f = fixture!;
    const s = services();

    const pending = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      metodo: 'EFECTIVO',
      monto: '50.00',
      claveIdempotencia: `${f.base.tag}:payment:guards-pending`,
    });

    await expect(
      s.apply.execute({
        id: pending.id,
        actorId: f.contabilidad.id,
        cuentaPorCobrarId: f.cuentas.a.id,
        monto: '10.00',
        claveIdempotencia: `${f.base.tag}:payment:guards-pending-apply`,
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_INVALID_STATE',
    });

    await s.verify.execute({
      id: pending.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:guards-verify`,
    });

    await expect(
      s.apply.execute({
        id: pending.id,
        actorId: f.contabilidad.id,
        cuentaPorCobrarId: f.cuentas.otroCliente.id,
        monto: '10.00',
        claveIdempotencia: `${f.base.tag}:payment:guards-client`,
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_VALIDATION_ERROR',
    });

    await expect(
      s.apply.execute({
        id: pending.id,
        actorId: f.contabilidad.id,
        cuentaPorCobrarId: f.cuentas.usd.id,
        monto: '10.00',
        claveIdempotencia: `${f.base.tag}:payment:guards-currency`,
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_VALIDATION_ERROR',
    });

    await expect(
      s.apply.execute({
        id: pending.id,
        actorId: f.contabilidad.id,
        cuentaPorCobrarId: f.cuentas.a.id,
        monto: '60.00',
        claveIdempotencia: `${f.base.tag}:payment:guards-available`,
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_AVAILABLE_AMOUNT_EXCEEDED',
    });

    const large = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      metodo: 'EFECTIVO',
      monto: '1000.00',
      claveIdempotencia: `${f.base.tag}:payment:guards-large`,
    });

    await s.verify.execute({
      id: large.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:guards-large-verify`,
    });

    await expect(
      s.apply.execute({
        id: large.id,
        actorId: f.contabilidad.id,
        cuentaPorCobrarId: f.cuentas.b.id,
        monto: '401.00',
        claveIdempotencia: `${f.base.tag}:payment:guards-receivable`,
      }),
    ).rejects.toMatchObject({
      code: 'RECEIVABLE_BALANCE_EXCEEDED',
    });
  });

  it('mantiene el invariante monetario bajo aplicaciones concurrentes', async () => {
    const f = fixture!;
    const s = services();

    const payment = await s.register.execute({
      actorId: f.contabilidad.id,
      clienteId: f.base.cliente.id,
      metodo: 'EFECTIVO',
      monto: '500.00',
      claveIdempotencia: `${f.base.tag}:payment:concurrent-source`,
    });

    await s.verify.execute({
      id: payment.id,
      actorId: f.contabilidad.id,
      claveIdempotencia: `${f.base.tag}:payment:concurrent-verify`,
    });

    const results = await Promise.allSettled([
      s.apply.execute({
        id: payment.id,
        actorId: f.contabilidad.id,
        cuentaPorCobrarId: f.cuentas.a.id,
        monto: '400.00',
        claveIdempotencia: `${f.base.tag}:payment:concurrent-a`,
      }),
      s.apply.execute({
        id: payment.id,
        actorId: f.contabilidad.id,
        cuentaPorCobrarId: f.cuentas.a.id,
        monto: '300.00',
        claveIdempotencia: `${f.base.tag}:payment:concurrent-b`,
      }),
    ]);

    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);

    const active = await prisma.pagoAplicacion.findMany({
      where: {
        pagoId: payment.id,
        estado: 'ACTIVA',
      },
    });

    const activeTotal = active.reduce(
      (sum, row) => sum + Number(row.monto.toFixed(2)),
      0,
    );

    expect(active).toHaveLength(1);
    expect(activeTotal).toBeLessThanOrEqual(500);

    const account = await prisma.cuentaPorCobrar.findUniqueOrThrow({
      where: { id: f.cuentas.a.id },
    });

    expect(Number(account.saldoPendiente.toFixed(2))).toBeGreaterThanOrEqual(100);
  });
});
