import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { PagosModule } from 'src/modules/pagos';
import {
  cleanupPaymentIntegrationFixture,
  createPaymentIntegrationFixture,
  PaymentIntegrationFixture,
} from '../pagos-integration/payment-fixture';

describe('Pagos HTTP E2E', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let fixture: PaymentIntegrationFixture;
  let tokens: Record<string, string>;

  let paymentId: number;
  let applicationId: number;
  let generalPaymentId: number;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            secret: config.get<string>('JWT_SECRET') || 'MySecretKey',
          }),
        }),
        PagosModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    assertLocalDatabase(process.env.DATABASE_URL);

    prisma = new PrismaClient();
    await prisma.$connect();

    fixture = await createPaymentIntegrationFixture(prisma);
    jwt = moduleRef.get(JwtService);

    const sign = (user: any) =>
      jwt.sign({
        sub: user.id,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol,
        empresaId: user.empresaId,
        activo: user.activo,
      });

    tokens = {
      admin: sign(fixture.base.admin),
      contabilidad: sign(fixture.contabilidad),
      vendedor: sign(fixture.base.vendedor),
      vendedorOtro: sign(fixture.base.otroVendedor),
      bodega: sign(fixture.base.bodegaUser),
      repartidor: sign(fixture.base.repartidor),
    };
  });

  afterAll(async () => {
    if (prisma && fixture) {
      await cleanupPaymentIntegrationFixture(prisma, fixture);
    }

    if (prisma) await prisma.$disconnect();
    if (app) await app.close();
  });

  const auth = (token: string) => ({
    Authorization: `Bearer ${token}`,
  });

  it('rechaza acceso sin JWT', async () => {
    await request(app.getHttpServer()).get('/pagos').expect(401);
  });

  it('limita el módulo financiero a roles autorizados', async () => {
    await request(app.getHttpServer())
      .get('/pagos')
      .set(auth(tokens.bodega))
      .expect(403);

    await request(app.getHttpServer())
      .get('/pagos')
      .set(auth(tokens.repartidor))
      .expect(403);
  });

  it('expone bancos activos seleccionables dentro de la empresa', async () => {
    const response = await request(app.getHttpServer())
      .get('/pagos/bancos')
      .set(auth(tokens.vendedor))
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        {
          id: fixture.banco.id,
          nombre: fixture.banco.nombre,
          codigo: fixture.banco.codigo,
        },
      ]),
    );

    expect(
      response.body.every((row: Record<string, unknown>) => !('cuenta' in row)),
    ).toBe(true);
  });

  it('rechaza transferencia sin banco y referencia', async () => {
    const response = await request(app.getHttpServer())
      .post('/pagos')
      .set(auth(tokens.contabilidad))
      .send({
        clienteId: fixture.base.cliente.id,
        metodo: 'TRANSFERENCIA_BANCO',
        monto: '100.00',
        claveIdempotencia: `E2E-PAY-BAD-TRANSFER-${fixture.base.tag}`,
      })
      .expect(422);

    expect(response.body.code).toBe('PAYMENT_VALIDATION_ERROR');
  });

  it('VENDEDOR registra pago de su pedido y retry HTTP es idempotente', async () => {
    const payload = {
      clienteId: fixture.base.cliente.id,
      pedidoId: fixture.base.pedido.id,
      metodo: 'EFECTIVO',
      moneda: 'GTQ',
      monto: '200.00',
      observaciones: 'Anticipo MIXTO E2E',
      claveIdempotencia: `E2E-PAY-CREATE-${fixture.base.tag}`,
    };

    const first = await request(app.getHttpServer())
      .post('/pagos')
      .set(auth(tokens.vendedor))
      .send(payload)
      .expect(201);

    const repeated = await request(app.getHttpServer())
      .post('/pagos')
      .set(auth(tokens.vendedor))
      .send(payload)
      .expect(201);

    paymentId = first.body.id;

    expect(repeated.body.id).toBe(paymentId);
    expect(first.body).toEqual(
      expect.objectContaining({
        estado: 'PENDIENTE',
        metodo: 'EFECTIVO',
        moneda: 'GTQ',
        monto: '200.00',
        montoAplicado: '0.00',
        montoDisponible: '200.00',
      }),
    );

    expect(first.body.pedido).toEqual(
      expect.objectContaining({
        id: fixture.base.pedido.id,
        condicionPago: 'MIXTO',
        estadoPago: 'PENDIENTE',
      }),
    );

    expect(
      await prisma.pago.count({
        where: {
          claveIdempotencia: payload.claveIdempotencia,
        },
      }),
    ).toBe(1);
  });

  it('VENDEDOR ajeno no puede registrar ni leer pagos del pedido', async () => {
    await request(app.getHttpServer())
      .post('/pagos')
      .set(auth(tokens.vendedorOtro))
      .send({
        clienteId: fixture.base.cliente.id,
        pedidoId: fixture.base.pedido.id,
        metodo: 'EFECTIVO',
        monto: '25.00',
        claveIdempotencia: `E2E-PAY-OTHER-SELLER-${fixture.base.tag}`,
      })
      .expect(403);

    const denied = await request(app.getHttpServer())
      .get(`/pagos/${paymentId}`)
      .set(auth(tokens.vendedorOtro))
      .expect(404);

    expect(denied.body.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('VENDEDOR propietario puede adjuntar comprobante pero no verificar', async () => {
    const proof = await request(app.getHttpServer())
      .post(`/pagos/${paymentId}/comprobantes`)
      .set(auth(tokens.vendedor))
      .send({
        url: 'https://example.test/e2e/payment-proof.png',
        key: `e2e/${fixture.base.tag}/payment-proof.png`,
        mimeType: 'image/png',
        size: 2048,
        descripcion: 'Comprobante E2E',
        claveIdempotencia: `E2E-PAY-PROOF-${fixture.base.tag}`,
      })
      .expect(201);

    expect(proof.body.comprobantes).toHaveLength(1);
    expect(proof.body.comprobantes[0]).toEqual(
      expect.objectContaining({
        mimeType: 'image/png',
        size: 2048,
        descripcion: 'Comprobante E2E',
      }),
    );

    await request(app.getHttpServer())
      .post(`/pagos/${paymentId}/verificar`)
      .set(auth(tokens.vendedor))
      .send({
        claveIdempotencia: `E2E-PAY-VENDOR-VERIFY-${fixture.base.tag}`,
      })
      .expect(403);
  });

  it('CONTABILIDAD verifica pago y sincroniza anticipo MIXTO a PARCIAL', async () => {
    const verified = await request(app.getHttpServer())
      .post(`/pagos/${paymentId}/verificar`)
      .set(auth(tokens.contabilidad))
      .send({
        claveIdempotencia: `E2E-PAY-VERIFY-${fixture.base.tag}`,
      })
      .expect(201);

    expect(verified.body.estado).toBe('VERIFICADO');
    expect(verified.body.verificadoPor).toEqual(
      expect.objectContaining({
        id: fixture.contabilidad.id,
      }),
    );
    expect(verified.body.pedido.estadoPago).toBe('PARCIAL');

    const order = await prisma.pedido.findUniqueOrThrow({
      where: { id: fixture.base.pedido.id },
    });

    expect(order.estadoPago).toBe('PARCIAL');
  });

  it('expone CxC candidatas y aplica parcialmente sin exceder el pago', async () => {
    const candidates = await request(app.getHttpServer())
      .get(`/pagos/${paymentId}/cuentas-candidatas?page=1&limit=20`)
      .set(auth(tokens.contabilidad))
      .expect(200);

    const candidate = candidates.body.data.find(
      (row: any) => row.id === fixture.cuentas.a.id,
    );

    expect(candidate).toEqual(
      expect.objectContaining({
        moneda: 'GTQ',
        montoOriginal: '600.00',
        saldoPendiente: '600.00',
        montoMaximoAplicable: '200.00',
      }),
    );

    const applied = await request(app.getHttpServer())
      .post(`/pagos/${paymentId}/aplicaciones`)
      .set(auth(tokens.contabilidad))
      .send({
        cuentaPorCobrarId: fixture.cuentas.a.id,
        monto: '200.00',
        claveIdempotencia: `E2E-PAY-APPLY-${fixture.base.tag}`,
      })
      .expect(201);

    applicationId = applied.body.aplicaciones.find(
      (row: any) =>
        row.cuentaPorCobrarId === fixture.cuentas.a.id &&
        row.estado === 'ACTIVA',
    ).id;

    expect(applied).toBeDefined();
    expect(applied.body.montoAplicado).toBe('200.00');
    expect(applied.body.montoDisponible).toBe('0.00');

    const account = await prisma.cuentaPorCobrar.findUniqueOrThrow({
      where: { id: fixture.cuentas.a.id },
    });

    expect(account.saldoPendiente.toFixed(2)).toBe('400.00');
    expect(account.estado).toBe('PARCIAL');

    const exceeded = await request(app.getHttpServer())
      .post(`/pagos/${paymentId}/aplicaciones`)
      .set(auth(tokens.contabilidad))
      .send({
        cuentaPorCobrarId: fixture.cuentas.a.id,
        monto: '1.00',
        claveIdempotencia: `E2E-PAY-EXCEEDED-${fixture.base.tag}`,
      })
      .expect(409);

    expect(exceeded.body.code).toBe(
      'PAYMENT_AVAILABLE_AMOUNT_EXCEEDED',
    );
  });

  it('revierte aplicación sin borrar historia financiera', async () => {
    const reversed = await request(app.getHttpServer())
      .post(
        `/pagos/${paymentId}/aplicaciones/${applicationId}/revertir`,
      )
      .set(auth(tokens.contabilidad))
      .send({
        motivo: 'Aplicación E2E revertida',
        claveIdempotencia: `E2E-PAY-REVERSE-${fixture.base.tag}`,
      })
      .expect(201);

    expect(reversed.body.montoAplicado).toBe('0.00');
    expect(reversed.body.montoDisponible).toBe('200.00');

    const [application, account] = await Promise.all([
      prisma.pagoAplicacion.findUniqueOrThrow({
        where: { id: applicationId },
      }),
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: fixture.cuentas.a.id },
      }),
    ]);

    expect(application.estado).toBe('REVERSADA');
    expect(account.saldoPendiente.toFixed(2)).toBe('600.00');
    expect(account.estado).toBe('PENDIENTE');
  });

  it('CONTABILIDAD puede rechazar un pago pendiente con auditoría', async () => {
    const created = await request(app.getHttpServer())
      .post('/pagos')
      .set(auth(tokens.contabilidad))
      .send({
        clienteId: fixture.base.cliente.id,
        bancoId: fixture.banco.id,
        metodo: 'TRANSFERENCIA_BANCO',
        monto: '100.00',
        referencia: `TRX-E2E-${fixture.base.tag}`,
        claveIdempotencia: `E2E-PAY-REJECT-SOURCE-${fixture.base.tag}`,
      })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/pagos/${created.body.id}/rechazar`)
      .set(auth(tokens.contabilidad))
      .send({
        motivo: 'Referencia no localizada en banco',
        claveIdempotencia: `E2E-PAY-REJECT-${fixture.base.tag}`,
      })
      .expect(201);

    expect(rejected.body.estado).toBe('RECHAZADO');
    expect(rejected.body.motivoRechazo).toBe(
      'Referencia no localizada en banco',
    );
  });

  it('pago general se distribuye entre varias CxC, cierra Crédito y completa Pedido', async () => {
    const created = await request(app.getHttpServer())
      .post('/pagos')
      .set(auth(tokens.contabilidad))
      .send({
        clienteId: fixture.base.cliente.id,
        metodo: 'EFECTIVO',
        monto: '1000.00',
        claveIdempotencia: `E2E-PAY-GENERAL-${fixture.base.tag}`,
      })
      .expect(201);

    generalPaymentId = created.body.id;

    await request(app.getHttpServer())
      .post(`/pagos/${generalPaymentId}/verificar`)
      .set(auth(tokens.contabilidad))
      .send({
        claveIdempotencia: `E2E-PAY-GENERAL-VERIFY-${fixture.base.tag}`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/pagos/${generalPaymentId}/aplicaciones`)
      .set(auth(tokens.contabilidad))
      .send({
        cuentaPorCobrarId: fixture.cuentas.a.id,
        monto: '600.00',
        claveIdempotencia: `E2E-PAY-GENERAL-A-${fixture.base.tag}`,
      })
      .expect(201);

    const completed = await request(app.getHttpServer())
      .post(`/pagos/${generalPaymentId}/aplicaciones`)
      .set(auth(tokens.contabilidad))
      .send({
        cuentaPorCobrarId: fixture.cuentas.b.id,
        monto: '400.00',
        claveIdempotencia: `E2E-PAY-GENERAL-B-${fixture.base.tag}`,
      })
      .expect(201);

    expect(completed.body.montoDisponible).toBe('0.00');

    const [credit, order, accountA, accountB] = await Promise.all([
      prisma.credito.findUniqueOrThrow({
        where: { id: fixture.credito.id },
      }),
      prisma.pedido.findUniqueOrThrow({
        where: { id: fixture.base.pedido.id },
      }),
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: fixture.cuentas.a.id },
      }),
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: fixture.cuentas.b.id },
      }),
    ]);

    expect(credit.estado).toBe('CERRADO');
    expect(order.estadoPago).toBe('PAGADO');
    expect(accountA.estado).toBe('PAGADA');
    expect(accountB.estado).toBe('PAGADA');

    const vendorCannotSeeGeneral = await request(app.getHttpServer())
      .get(`/pagos/${generalPaymentId}`)
      .set(auth(tokens.vendedor))
      .expect(404);

    expect(vendorCannotSeeGeneral.body.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('anula pago verificado y restaura cartera, Crédito y Pedido', async () => {
    const voided = await request(app.getHttpServer())
      .post(`/pagos/${generalPaymentId}/anular`)
      .set(auth(tokens.admin))
      .send({
        motivo: 'Anulación E2E de pago general',
        claveIdempotencia: `E2E-PAY-VOID-${fixture.base.tag}`,
      })
      .expect(201);

    expect(voided.body.estado).toBe('ANULADO');
    expect(
      voided.body.aplicaciones.every(
        (row: any) => row.estado === 'REVERSADA',
      ),
    ).toBe(true);

    const [credit, order, accountA, accountB] = await Promise.all([
      prisma.credito.findUniqueOrThrow({
        where: { id: fixture.credito.id },
      }),
      prisma.pedido.findUniqueOrThrow({
        where: { id: fixture.base.pedido.id },
      }),
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: fixture.cuentas.a.id },
      }),
      prisma.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: fixture.cuentas.b.id },
      }),
    ]);

    expect(credit.estado).toBe('ACTIVO');
    expect(credit.cerradoEn).toBeNull();
    expect(order.estadoPago).toBe('PARCIAL');
    expect(accountA.saldoPendiente.toFixed(2)).toBe('600.00');
    expect(accountB.saldoPendiente.toFixed(2)).toBe('400.00');
  });

  it('expone auditoría, aplicaciones, listado scoped y resumen financiero', async () => {
    const [events, applications, summary, vendorList] = await Promise.all([
      request(app.getHttpServer())
        .get(`/pagos/${generalPaymentId}/eventos?page=1&limit=50`)
        .set(auth(tokens.contabilidad))
        .expect(200),
      request(app.getHttpServer())
        .get(`/pagos/${generalPaymentId}/aplicaciones?page=1&limit=50`)
        .set(auth(tokens.contabilidad))
        .expect(200),
      request(app.getHttpServer())
        .get('/pagos/resumen')
        .set(auth(tokens.admin))
        .expect(200),
      request(app.getHttpServer())
        .get('/pagos?page=1&limit=100')
        .set(auth(tokens.vendedor))
        .expect(200),
    ]);

    expect(events.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tipo: 'CREADO' }),
        expect.objectContaining({ tipo: 'VERIFICADO' }),
        expect.objectContaining({ tipo: 'APLICADO' }),
        expect.objectContaining({ tipo: 'APLICACION_REVERTIDA' }),
        expect.objectContaining({ tipo: 'ANULADO' }),
      ]),
    );

    expect(applications.body.data).toHaveLength(2);
    expect(
      applications.body.data.every(
        (row: any) => row.estado === 'REVERSADA',
      ),
    ).toBe(true);

    expect(summary.body).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        porEstado: expect.any(Object),
        porMetodo: expect.any(Object),
        montos: expect.objectContaining({
          verificado: expect.any(String),
          pendiente: expect.any(String),
          disponibleNoAplicado: expect.any(String),
        }),
      }),
    );

    expect(
      vendorList.body.data.some(
        (row: any) => row.id === paymentId,
      ),
    ).toBe(true);

    expect(
      vendorList.body.data.some(
        (row: any) => row.id === generalPaymentId,
      ),
    ).toBe(false);
  });
});

function assertLocalDatabase(value?: string): void {
  if (!value) {
    throw new Error('DATABASE_URL no está definida.');
  }

  const url = new URL(value);

  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(
      `Pagos E2E rechazada: DATABASE_URL apunta a "${url.hostname}". Solo PostgreSQL local.`,
    );
  }
}
