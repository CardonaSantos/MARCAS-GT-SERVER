import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { DespachosModule } from 'src/modules/despachos';
import {
  cleanupDispatchE2EFixture,
  createDispatchE2EFixture,
  DispatchE2EFixture,
} from './dispatch-e2e.fixtures';

type TokenName =
  | 'admin'
  | 'bodega'
  | 'vendedor'
  | 'vendedorOtro'
  | 'contabilidad'
  | 'repartidor';

describe('Despachos HTTP E2E', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let fixture: DispatchE2EFixture;
  let tokens: Record<TokenName, string>;

  let dispatchId: number;
  let dispatchDetailId: number;
  let otherSellerDispatchId: number;
  let retryDispatchId: number;
  let failedReservationOperationId: number;

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
        DespachosModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    assertLocalDatabase(process.env.DATABASE_URL);

    prisma = new PrismaClient({
      log: process.env.E2E_PRISMA_LOG === '1' ? ['error', 'warn'] : [],
    });
    await prisma.$connect();

    fixture = await createDispatchE2EFixture(prisma);
    jwt = moduleRef.get(JwtService);

    const sign = (user: {
      id: number;
      nombre: string;
      correo: string;
      rol: string;
      empresaId: number | null;
      activo: boolean;
    }) =>
      jwt.sign({
        sub: user.id,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol,
        empresaId: user.empresaId,
        activo: user.activo,
      });

    tokens = {
      admin: sign(fixture.admin),
      bodega: sign(fixture.bodegaUser),
      vendedor: sign(fixture.vendedor),
      vendedorOtro: sign(fixture.vendedorOtro),
      contabilidad: sign(fixture.contabilidad),
      repartidor: sign(fixture.repartidor),
    };
  });

  afterAll(async () => {
    if (prisma && fixture) {
      await cleanupDispatchE2EFixture(prisma, fixture);
    }

    if (prisma) {
      await prisma.$disconnect();
    }

    if (app) {
      await app.close();
    }
  });

  const auth = (token: string) => ({
    Authorization: `Bearer ${token}`,
  });

  it('rechaza consultas sin JWT', async () => {
    await request(app.getHttpServer()).get('/despachos').expect(401);
  });

  it('permite lectura general a VENDEDOR', async () => {
    const response = await request(app.getHttpServer())
      .get('/despachos?page=1&limit=20')
      .set(auth(tokens.vendedor))
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        data: expect.any(Array),
        meta: expect.any(Object),
      }),
    );
  });

  it('impide candidatos a REPARTIDOR', async () => {
    await request(app.getHttpServer())
      .get('/despachos/candidatos?page=1&limit=20')
      .set(auth(tokens.repartidor))
      .expect(403);
  });

  it('permite candidatos a CONTABILIDAD', async () => {
    await request(app.getHttpServer())
      .get('/despachos/candidatos?page=1&limit=20')
      .set(auth(tokens.contabilidad))
      .expect(200);
  });

  it('impide crear despachos a VENDEDOR', async () => {
    await request(app.getHttpServer())
      .post('/despachos')
      .set(auth(tokens.vendedor))
      .send({
        pedidoId: fixture.pedidoPrincipal.id,
        bodegaId: fixture.bodega.id,
        detalles: [
          {
            pedidoDetalleId: fixture.pedidoPrincipalDetalle.id,
            cantidadProgramada: 10,
          },
        ],
      })
      .expect(403);
  });

  it('aplica whitelist/forbidNonWhitelisted del DTO', async () => {
    const response = await request(app.getHttpServer())
      .post('/despachos')
      .set(auth(tokens.admin))
      .send({
        pedidoId: fixture.pedidoPrincipal.id,
        bodegaId: fixture.bodega.id,
        campoQueNoExiste: true,
        detalles: [
          {
            pedidoDetalleId: fixture.pedidoPrincipalDetalle.id,
            cantidadProgramada: 10,
          },
        ],
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('property campoQueNoExiste should not exist'),
      ]),
    );
  });

  it('muestra el pedido principal como candidato', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/despachos/candidatos?page=1&limit=100&search=${encodeURIComponent(
          fixture.pedidoPrincipal.numero!,
        )}`,
      )
      .set(auth(tokens.admin))
      .expect(200);

    expect(
      response.body.data.some(
        (item: any) => item.pedido.id === fixture.pedidoPrincipal.id,
      ),
    ).toBe(true);
  });

  it('ADMIN crea un despacho real', async () => {
    const response = await request(app.getHttpServer())
      .post('/despachos')
      .set(auth(tokens.admin))
      .send({
        pedidoId: fixture.pedidoPrincipal.id,
        bodegaId: fixture.bodega.id,
        observaciones: 'Despacho E2E principal',
        detalles: [
          {
            pedidoDetalleId: fixture.pedidoPrincipalDetalle.id,
            cantidadProgramada: 10,
          },
        ],
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        numero: expect.stringMatching(/^DSP-\d{6}$/),
        estado: 'PENDIENTE',
      }),
    );

    dispatchId = response.body.id;
    dispatchDetailId = response.body.detalles[0].id;
  });

  it('crea un despacho de otro vendedor para validar scope', async () => {
    const response = await request(app.getHttpServer())
      .post('/despachos')
      .set(auth(tokens.admin))
      .send({
        pedidoId: fixture.pedidoOtroVendedor.id,
        bodegaId: fixture.bodega.id,
        detalles: [
          {
            pedidoDetalleId: fixture.pedidoOtroVendedorDetalle.id,
            cantidadProgramada: 1,
          },
        ],
      })
      .expect(201);

    otherSellerDispatchId = response.body.id;
  });

  it('VENDEDOR no puede leer el despacho de otro vendedor', async () => {
    const response = await request(app.getHttpServer())
      .get(`/despachos/${otherSellerDispatchId}`)
      .set(auth(tokens.vendedor))
      .expect(404);

    expect(response.body.code).toBe('DISPATCH_NOT_FOUND');
  });

  it('inicia preparación y reserva inventario por HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post(`/despachos/${dispatchId}/iniciar-preparacion`)
      .set(auth(tokens.bodega))
      .send({
        claveIdempotencia: `E2E-PREP-${fixture.suffix}`,
        observaciones: 'Reserva E2E',
      })
      .expect(201);

    expect(response.body.result).toEqual(
      expect.objectContaining({
        status: 'APLICADA',
      }),
    );
    expect(response.body.despacho.estado).toBe('PREPARANDO');

    const stock = await prisma.stockBodega.findUniqueOrThrow({
      where: { id: fixture.stock.id },
    });

    expect(stock.cantidadReal).toBe(10);
    expect(stock.cantidadReservada).toBe(10);
    expect(stock.cantidadDisponible).toBe(0);
  });

  it('actualiza físicamente la preparación', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/despachos/${dispatchId}/preparacion`)
      .set(auth(tokens.bodega))
      .send({
        detalles: [
          {
            detalleId: dispatchDetailId,
            cantidadPreparada: 10,
            observaciones: 'Todo preparado',
          },
        ],
      })
      .expect(200);

    // expect(response.body.estado).toBe('PREPARANDO');
    // expect(response.body.detalles[0].cantidadPreparada).toBe(
    //   10,
    // );

    expect(response.body.estado).toBe('PREPARANDO');

    expect(response.body.detalles[0].despacho).toEqual(
      expect.objectContaining({
        cantidadProgramada: 10,
        cantidadPreparada: 10,
        cantidadDespachada: 0,
        pendientePreparar: 0,
        pendienteDespachar: 10,
        porcentajePreparacion: 100,
        porcentajeDespacho: 0,
      }),
    );
  });

  it('finaliza la preparación', async () => {
    const response = await request(app.getHttpServer())
      .post(`/despachos/${dispatchId}/finalizar-preparacion`)
      .set(auth(tokens.bodega))
      .expect(201);

    expect(response.body.estado).toBe('PREPARADA');
  });

  it('registra una salida parcial y sincroniza Inventario/Pedido', async () => {
    const response = await request(app.getHttpServer())
      .post(`/despachos/${dispatchId}/salidas`)
      .set(auth(tokens.bodega))
      .send({
        claveIdempotencia: `E2E-OUT-A-${fixture.suffix}`,
        detalles: [
          {
            detalleId: dispatchDetailId,
            cantidad: 4,
          },
        ],
      })
      .expect(201);

    expect(response.body.despacho.estado).toBe('PARCIALMENTE_DESPACHADA');

    const [stock, detail] = await Promise.all([
      prisma.stockBodega.findUniqueOrThrow({
        where: { id: fixture.stock.id },
      }),
      prisma.pedidoDetalle.findUniqueOrThrow({
        where: {
          id: fixture.pedidoPrincipalDetalle.id,
        },
      }),
    ]);

    expect(stock).toEqual(
      expect.objectContaining({
        cantidadReal: 6,
        cantidadReservada: 6,
        cantidadDisponible: 0,
      }),
    );
    expect(detail.cantidadDespachada).toBe(4);
  });

  it('registra la salida restante y completa el despacho', async () => {
    const response = await request(app.getHttpServer())
      .post(`/despachos/${dispatchId}/salidas`)
      .set(auth(tokens.bodega))
      .send({
        claveIdempotencia: `E2E-OUT-B-${fixture.suffix}`,
        detalles: [
          {
            detalleId: dispatchDetailId,
            cantidad: 6,
          },
        ],
      })
      .expect(201);

    expect(response.body.despacho.estado).toBe('DESPACHADA');

    const [stock, detail, order] = await Promise.all([
      prisma.stockBodega.findUniqueOrThrow({
        where: { id: fixture.stock.id },
      }),
      prisma.pedidoDetalle.findUniqueOrThrow({
        where: {
          id: fixture.pedidoPrincipalDetalle.id,
        },
      }),
      prisma.pedido.findUniqueOrThrow({
        where: { id: fixture.pedidoPrincipal.id },
      }),
    ]);

    expect(stock).toEqual(
      expect.objectContaining({
        cantidadReal: 0,
        cantidadReservada: 0,
        cantidadDisponible: 0,
      }),
    );
    expect(detail.cantidadDespachada).toBe(10);
    expect(order.estado).toBe('DESPACHADO');
  });

  it('rechaza cancelar un despacho que ya tuvo salida física', async () => {
    const response = await request(app.getHttpServer())
      .post(`/despachos/${dispatchId}/cancelar`)
      .set(auth(tokens.admin))
      .send({
        motivo: 'No debe poder cancelarse',
        claveIdempotencia: `E2E-CANCEL-LATE-${fixture.suffix}`,
      })
      .expect(409);

    expect(response.body.code).toBe('DISPATCH_INVALID_STATE');
  });

  it('expone eventos y operaciones del despacho', async () => {
    const [events, operations] = await Promise.all([
      request(app.getHttpServer())
        .get(`/despachos/${dispatchId}/eventos?page=1&limit=100`)
        .set(auth(tokens.admin))
        .expect(200),
      request(app.getHttpServer())
        .get(`/despachos/${dispatchId}/operaciones?page=1&limit=100`)
        .set(auth(tokens.admin))
        .expect(200),
    ]);

    expect(events.body.data.length).toBeGreaterThanOrEqual(4);
    expect(
      events.body.data.some((event: any) => event.tipo === 'DESPACHADA'),
    ).toBe(true);

    expect(operations.body.data.length).toBeGreaterThanOrEqual(3);
    expect(
      operations.body.data.some(
        (operation: any) =>
          operation.tipo === 'SALIDA_DESPACHO' &&
          operation.estado === 'APLICADA',
      ),
    ).toBe(true);
  });

  it('expone resumen y reporte operacional', async () => {
    const [summary, report] = await Promise.all([
      request(app.getHttpServer())
        .get('/despachos/resumen')
        .set(auth(tokens.admin))
        .expect(200),
      request(app.getHttpServer())
        .get('/despachos/reportes/operacion')
        .set(auth(tokens.admin))
        .expect(200),
    ]);

    expect(summary.body).toEqual(
      expect.objectContaining({
        totalOrdenes: expect.any(Number),
        unidades: expect.any(Object),
        operaciones: expect.any(Object),
      }),
    );

    expect(report.body).toEqual(
      expect.objectContaining({
        puntualidad: expect.any(Object),
        colaAbierta: expect.any(Object),
        confiabilidadOperaciones: expect.any(Object),
        tendenciaDiaria: expect.any(Array),
      }),
    );
  });

  it('permite al vendedor agregar observación a un despacho propio', async () => {
    const response = await request(app.getHttpServer())
      .post(`/despachos/${dispatchId}/observaciones`)
      .set(auth(tokens.vendedor))
      .send({
        detalle: 'Observación E2E del vendedor',
      })
      .expect(201);

    expect(response.body.id).toBe(dispatchId);
  });

  it('CONTABILIDAD puede leer pero no ejecutar una salida', async () => {
    await request(app.getHttpServer())
      .get(`/despachos/${dispatchId}`)
      .set(auth(tokens.contabilidad))
      .expect(200);

    await request(app.getHttpServer())
      .post(`/despachos/${dispatchId}/salidas`)
      .set(auth(tokens.contabilidad))
      .send({
        claveIdempotencia: `E2E-FORBIDDEN-${fixture.suffix}`,
        detalles: [
          {
            detalleId: dispatchDetailId,
            cantidad: 1,
          },
        ],
      })
      .expect(403);
  });

  it('crea segundo despacho que falla por disponibilidad y persiste operación FALLIDA', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/despachos')
      .set(auth(tokens.admin))
      .send({
        pedidoId: fixture.pedidoRetry.id,
        bodegaId: fixture.bodega.id,
        detalles: [
          {
            pedidoDetalleId: fixture.pedidoRetryDetalle.id,
            cantidadProgramada: 2,
          },
        ],
      })
      .expect(201);

    retryDispatchId = createResponse.body.id;

    const failure = await request(app.getHttpServer())
      .post(`/despachos/${retryDispatchId}/iniciar-preparacion`)
      .set(auth(tokens.bodega))
      .send({
        claveIdempotencia: `E2E-RETRY-PREP-${fixture.suffix}`,
      })
      .expect(409);

    expect(failure.body.code).toBe('DISPATCH_INSUFFICIENT_AVAILABILITY');

    const operations = await request(app.getHttpServer())
      .get(`/despachos/${retryDispatchId}/operaciones?page=1&limit=100`)
      .set(auth(tokens.admin))
      .expect(200);

    const failed = operations.body.data.find(
      (operation: any) =>
        operation.tipo === 'RESERVA_PREPARACION' &&
        operation.estado === 'FALLIDA',
    );

    expect(failed).toBeDefined();
    failedReservationOperationId = failed.id;
  });

  it('reintenta por HTTP después de reponer stock', async () => {
    await prisma.stockBodega.update({
      where: { id: fixture.stock.id },
      data: {
        cantidadReal: 5,
        cantidadReservada: 0,
        cantidadDisponible: 5,
        version: { increment: 1 },
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/despachos/operaciones/${failedReservationOperationId}/reintentar`)
      .set(auth(tokens.bodega))
      .expect(201);

    expect(response.body.result).toEqual(
      expect.objectContaining({
        operationId: failedReservationOperationId,
        status: 'APLICADA',
      }),
    );
    expect(response.body.despacho.estado).toBe('PREPARANDO');

    const stock = await prisma.stockBodega.findUniqueOrThrow({
      where: { id: fixture.stock.id },
    });

    expect(stock.cantidadReal).toBe(5);
    expect(stock.cantidadReservada).toBe(2);
    expect(stock.cantidadDisponible).toBe(3);
  });

  it('cancela un despacho en preparación y libera su reserva', async () => {
    const response = await request(app.getHttpServer())
      .post(`/despachos/${retryDispatchId}/cancelar`)
      .set(auth(tokens.bodega))
      .send({
        motivo: 'Cancelación E2E antes de salida',
        claveIdempotencia: `E2E-CANCEL-RETRY-${fixture.suffix}`,
      })
      .expect(201);

    expect(response.body.despacho.estado).toBe('CANCELADA');

    const [stock, detail, order] = await Promise.all([
      prisma.stockBodega.findUniqueOrThrow({
        where: { id: fixture.stock.id },
      }),
      prisma.pedidoDetalle.findUniqueOrThrow({
        where: { id: fixture.pedidoRetryDetalle.id },
      }),
      prisma.pedido.findUniqueOrThrow({
        where: { id: fixture.pedidoRetry.id },
      }),
    ]);

    expect(stock.cantidadReal).toBe(5);
    expect(stock.cantidadReservada).toBe(0);
    expect(stock.cantidadDisponible).toBe(5);
    expect(detail.cantidadReservada).toBe(0);
    expect(order.estado).toBe('CONFIRMADO');
  });

  it('ParseIntPipe devuelve 400 para un id inválido', async () => {
    await request(app.getHttpServer())
      .get('/despachos/no-es-numero')
      .set(auth(tokens.admin))
      .expect(400);
  });
});

function assertLocalDatabase(value?: string): void {
  if (!value) {
    throw new Error(
      'DATABASE_URL no está definida. La suite E2E usa la BD local configurada en .env.',
    );
  }

  const url = new URL(value);

  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(
      `E2E rechazado: DATABASE_URL apunta a "${url.hostname}". ` +
        'Esta suite solo permite PostgreSQL local.',
    );
  }
}
