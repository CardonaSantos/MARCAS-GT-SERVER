import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { EntregasModule } from 'src/modules/entregas';
import {
  cleanupTransportE2EFixture,
  createTransportE2EFixture,
  TransportE2EFixture,
} from '../transporte-e2e/transport-e2e.fixtures';

describe('Entregas HTTP E2E', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let fixture: TransportE2EFixture;
  let tokens: Record<string, string>;
  let shipmentId: number;
  let loadId: number;
  let stopId: number;
  let deliveryId: number;
  let deliveryLineId: number;

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
        EntregasModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    assertLocalDatabase(process.env.DATABASE_URL);

    prisma = new PrismaClient();
    await prisma.$connect();
    fixture = await createTransportE2EFixture(prisma);
    jwt = moduleRef.get(JwtService);

    const sign = (user: any) => jwt.sign({
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
      vendedorOtro: sign(fixture.otroVendedor),
      contabilidad: sign(fixture.contabilidad),
      repartidor: sign(fixture.repartidor),
    };
  });

  afterAll(async () => {
    if (prisma && fixture) {
      await prisma.entrega.deleteMany({
        where: { pedido: { empresaId: fixture.empresa.id } },
      });
      await cleanupTransportE2EFixture(prisma, fixture);
    }
    if (prisma) await prisma.$disconnect();
    if (app) await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('rechaza acceso sin JWT', async () => {
    await request(app.getHttpServer()).get('/entregas').expect(401);
  });

  it('prepara un envío interno EN_RUTA para la entrega', async () => {
    const created = await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.admin))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'INTERNO',
        paradas: [{
          ordenDespachoId: fixture.mainDispatch.orden.id,
          secuencia: 1,
          cargas: [{
            ordenDespachoDetalleId: fixture.mainDispatch.detalle.id,
            cantidadPlanificada: 6,
          }],
        }],
      })
      .expect(201);

    shipmentId = created.body.id;

    const shipment = await prisma.envio.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { despachos: { include: { cargas: true } } },
    });
    stopId = shipment.despachos[0].id;
    loadId = shipment.despachos[0].cargas[0].id;

    await request(app.getHttpServer())
      .post(`/envios/${shipmentId}/asignar`)
      .set(auth(tokens.admin))
      .send({
        vehiculoId: fixture.vehiculo.id,
        conductorId: fixture.conductor.id,
        responsableId: fixture.repartidor.id,
        claveIdempotencia: `DEL-E2E-ASSIGN-${fixture.suffix}`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/envios/${shipmentId}/confirmar-carga`)
      .set(auth(tokens.bodega))
      .send({
        claveIdempotencia: `DEL-E2E-LOAD-${fixture.suffix}`,
        lineas: [{ cargaDetalleId: loadId, cantidadCargada: 6 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/envios/${shipmentId}/iniciar-ruta`)
      .set(auth(tokens.repartidor))
      .send({
        claveIdempotencia: `DEL-E2E-ROUTE-${fixture.suffix}`,
        latitud: 15.6666667,
        longitud: -91.7111111,
      })
      .expect(201);
  });

  it('REPARTIDOR ve la parada en candidatos', async () => {
    const response = await request(app.getHttpServer())
      .get('/entregas/candidatos?page=1&limit=20')
      .set(auth(tokens.repartidor))
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ envioDespachoId: stopId }),
      ]),
    );
  });

  it('VENDEDOR no puede crear entregas', async () => {
    await request(app.getHttpServer())
      .post('/entregas')
      .set(auth(tokens.vendedor))
      .send({
        envioDespachoId: stopId,
        claveIdempotencia: `DEL-E2E-FORBIDDEN-${fixture.suffix}`,
      })
      .expect(403);
  });

  it('REPARTIDOR crea e inicia la entrega idempotentemente', async () => {
    const created = await request(app.getHttpServer())
      .post('/entregas')
      .set(auth(tokens.repartidor))
      .send({
        envioDespachoId: stopId,
        claveIdempotencia: `DEL-E2E-CREATE-${fixture.suffix}`,
      })
      .expect(201);

    deliveryId = created.body.id;
    deliveryLineId = created.body.detalles[0].id;

    const startBody = {
      claveIdempotencia: `DEL-E2E-START-${fixture.suffix}`,
      latitud: 15.6666667,
      longitud: -91.7111111,
    };

    await request(app.getHttpServer())
      .post(`/entregas/${deliveryId}/iniciar`)
      .set(auth(tokens.repartidor))
      .send(startBody)
      .expect(201);

    const repeated = await request(app.getHttpServer())
      .post(`/entregas/${deliveryId}/iniciar`)
      .set(auth(tokens.repartidor))
      .send(startBody)
      .expect(201);

    expect(repeated.body.estado).toBe('EN_RUTA');
  });

  it('registra resultado y evidencia', async () => {
    await request(app.getHttpServer())
      .patch(`/entregas/${deliveryId}/resultado`)
      .set(auth(tokens.repartidor))
      .send({
        receptorNombre: 'Cliente E2E',
        receptorDocumento: 'DOC-E2E',
        latitud: 15.6666667,
        longitud: -91.7111111,
        detalles: [{
          detalleId: deliveryLineId,
          cantidadEntregada: 6,
          cantidadRechazada: 0,
        }],
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/entregas/${deliveryId}/evidencias`)
      .set(auth(tokens.repartidor))
      .send({
        tipo: 'FIRMA',
        url: 'https://example.test/e2e-firma.png',
        mimeType: 'image/png',
        size: 100,
        descripcion: 'Firma E2E',
        claveIdempotencia: `DEL-E2E-EVIDENCE-${fixture.suffix}`,
      })
      .expect(201);

    expect(response.body.entrega.evidencias.tieneFirma).toBe(true);
  });

  it('finaliza completa y un retry no duplica efectos', async () => {
    const payload = {
      resultado: 'ENTREGADA',
      receptorNombre: 'Cliente E2E',
      receptorDocumento: 'DOC-E2E',
      latitud: 15.6666667,
      longitud: -91.7111111,
      claveIdempotencia: `DEL-E2E-FINAL-${fixture.suffix}`,
    };

    const first = await request(app.getHttpServer())
      .post(`/entregas/${deliveryId}/finalizar`)
      .set(auth(tokens.repartidor))
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/entregas/${deliveryId}/finalizar`)
      .set(auth(tokens.repartidor))
      .send(payload)
      .expect(201);

    expect(first.body.estado).toBe('ENTREGADA');
    expect(second.body.estado).toBe('ENTREGADA');

    const [line, stop, shipment, orderEvents, transportEvents] = await Promise.all([
      prisma.pedidoDetalle.findUniqueOrThrow({ where: { id: fixture.pedidoDetalle.id } }),
      prisma.envioDespacho.findUniqueOrThrow({ where: { id: stopId } }),
      prisma.envio.findUniqueOrThrow({ where: { id: shipmentId } }),
      prisma.pedidoEvento.count({
        where: { pedidoId: fixture.pedido.id, referenciaTipo: 'ENTREGA', referenciaId: deliveryId },
      }),
      prisma.envioEvento.count({
        where: { envioId: shipmentId, claveIdempotencia: `DEL-E2E-FINAL-${fixture.suffix}:TRANSPORT` },
      }),
    ]);

    expect(line.cantidadEntregada).toBe(6);
    expect(stop.estado).toBe('ATENDIDA');
    expect(shipment.estado).toBe('COMPLETADO');
    expect(orderEvents).toBe(1);
    expect(transportEvents).toBe(1);
  });

  it('VENDEDOR ve su entrega en solo lectura y otro vendedor queda fuera del scope', async () => {
    const own = await request(app.getHttpServer())
      .get(`/entregas/${deliveryId}`)
      .set(auth(tokens.vendedor))
      .expect(200);

    expect(own.body.acciones.puedeAgregarObservacion).toBe(false);

    await request(app.getHttpServer())
      .post(`/entregas/${deliveryId}/observaciones`)
      .set(auth(tokens.vendedor))
      .send({
        detalle: 'No debe permitirse.',
        claveIdempotencia: `DEL-E2E-SELLER-OBS-${fixture.suffix}`,
      })
      .expect(403);

    const accounting = await request(app.getHttpServer())
      .get(`/entregas/${deliveryId}`)
      .set(auth(tokens.contabilidad))
      .expect(200);

    expect(accounting.body.acciones.puedeAgregarObservacion).toBe(false);

    await request(app.getHttpServer())
      .post(`/entregas/${deliveryId}/observaciones`)
      .set(auth(tokens.contabilidad))
      .send({
        detalle: 'Tampoco debe permitirse.',
        claveIdempotencia: `DEL-E2E-ACCOUNTING-OBS-${fixture.suffix}`,
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/entregas/${deliveryId}`)
      .set(auth(tokens.vendedorOtro))
      .expect(404);
  });

  it('expone resumen y reporte operacional', async () => {
    const [summary, report] = await Promise.all([
      request(app.getHttpServer())
        .get('/entregas/resumen')
        .set(auth(tokens.admin))
        .expect(200),
      request(app.getHttpServer())
        .get('/entregas/reportes/operacion')
        .set(auth(tokens.contabilidad))
        .expect(200),
    ]);

    expect(summary.body).toEqual(expect.objectContaining({
      total: expect.any(Number),
      porEstado: expect.any(Object),
      efectividad: expect.any(Object),
      unidades: expect.any(Object),
      evidencia: expect.any(Object),
      facturacion: expect.any(Object),
    }));

    expect(report.body).toEqual(expect.objectContaining({
      rango: expect.any(Object),
      efectividad: expect.any(Object),
      motivosNoEntrega: expect.any(Array),
      tendenciaDiaria: expect.any(Array),
      puntualidad: expect.any(Object),
      evidencia: expect.any(Object),
      repartidores: expect.any(Array),
    }));

    await request(app.getHttpServer())
      .get('/entregas/reportes/operacion')
      .set(auth(tokens.vendedor))
      .expect(403);
  });
});

function assertLocalDatabase(value?: string): void {
  if (!value) throw new Error('DATABASE_URL no está definida.');
  const url = new URL(value);
  if (!['localhost','127.0.0.1','::1'].includes(url.hostname)) {
    throw new Error(`E2E rechazado: DATABASE_URL apunta a "${url.hostname}". Solo PostgreSQL local.`);
  }
}
