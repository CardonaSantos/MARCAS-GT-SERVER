import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { TransporteModule } from 'src/modules/transporte';
import {
  cleanupTransportE2EFixture,
  createTransportE2EFixture,
  TransportE2EFixture,
} from './transport-e2e.fixtures';

type TokenName =
  | 'admin'
  | 'bodega'
  | 'vendedor'
  | 'vendedorOtro'
  | 'contabilidad'
  | 'repartidor'
  | 'repartidorOtro';

describe('Transporte HTTP E2E', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let fixture: TransportE2EFixture;
  let tokens: Record<TokenName, string>;

  let mainShipmentId: number;
  let mainLoadId: number;
  let secondaryShipmentId: number;
  let secondaryLoadId: number;
  let otherSellerShipmentId: number;
  let externalShipmentId: number;

  let spareVehicleId: number;
  let spareDriverId: number;
  let externalCarrierId: number;

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
        TransporteModule,
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

    fixture = await createTransportE2EFixture(prisma);
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
      vendedorOtro: sign(fixture.otroVendedor),
      contabilidad: sign(fixture.contabilidad),
      repartidor: sign(fixture.repartidor),
      repartidorOtro: sign(fixture.repartidorOtro),
    };
  });

  afterAll(async () => {
    if (prisma && fixture) {
      await cleanupTransportE2EFixture(prisma, fixture);
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

  it('rechaza envíos sin JWT', async () => {
    await request(app.getHttpServer())
      .get('/envios')
      .expect(401);
  });

  it('rechaza catálogos sin JWT', async () => {
    await request(app.getHttpServer())
      .get('/vehiculos')
      .expect(401);
  });

  it('VENDEDOR puede listar envíos dentro de su scope', async () => {
    const response = await request(app.getHttpServer())
      .get('/envios?page=1&limit=20')
      .set(auth(tokens.vendedor))
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        data: expect.any(Array),
        meta: expect.any(Object),
      }),
    );
  });

  it('REPARTIDOR no puede consultar candidatos', async () => {
    await request(app.getHttpServer())
      .get('/envios/candidatos?page=1&limit=20')
      .set(auth(tokens.repartidor))
      .expect(403);
  });

  it('CONTABILIDAD sí puede consultar candidatos', async () => {
    await request(app.getHttpServer())
      .get('/envios/candidatos?page=1&limit=20')
      .set(auth(tokens.contabilidad))
      .expect(200);
  });

  it('VENDEDOR no puede crear envíos', async () => {
    await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.vendedor))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'INTERNO',
        paradas: [
          {
            ordenDespachoId: fixture.mainDispatch.orden.id,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: fixture.mainDispatch.detalle.id,
                cantidadPlanificada: 1,
              },
            ],
          },
        ],
      })
      .expect(403);
  });

  it('forbidNonWhitelisted rechaza propiedades desconocidas', async () => {
    const response = await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.admin))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'INTERNO',
        campoQueNoExiste: true,
        paradas: [
          {
            ordenDespachoId: fixture.mainDispatch.orden.id,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: fixture.mainDispatch.detalle.id,
                cantidadPlanificada: 1,
              },
            ],
          },
        ],
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'property campoQueNoExiste should not exist',
        ),
      ]),
    );
  });

  it('ParseIntPipe devuelve 400 para id inválido', async () => {
    await request(app.getHttpServer())
      .get('/envios/no-es-numero')
      .set(auth(tokens.admin))
      .expect(400);
  });

  it('CONTABILIDAD lee catálogos pero no puede crear recursos', async () => {
    await request(app.getHttpServer())
      .get('/vehiculos')
      .set(auth(tokens.contabilidad))
      .expect(200);

    await request(app.getHttpServer())
      .post('/vehiculos')
      .set(auth(tokens.contabilidad))
      .send({
        placa: `E2E-FORBIDDEN-${fixture.suffix}`,
      })
      .expect(403);
  });

  it('crea recursos de transporte por HTTP', async () => {
    const [vehicle, driver, carrier] = await Promise.all([
      request(app.getHttpServer())
        .post('/vehiculos')
        .set(auth(tokens.admin))
        .send({
          placa: `E2E-SPARE-${fixture.suffix}`,
          marca: 'Toyota',
          modelo: 'E2E',
          capacidadKg: 900,
        })
        .expect(201),

      request(app.getHttpServer())
        .post('/conductores')
        .set(auth(tokens.bodega))
        .send({
          nombre: `Conductor E2E ${fixture.suffix}`,
          telefono: '55553333',
          licencia: `LIC-E2E-${fixture.suffix}`,
        })
        .expect(201),

      request(app.getHttpServer())
        .post('/transportistas')
        .set(auth(tokens.admin))
        .send({
          codigo: `E2E-EXT-${fixture.suffix}`,
          tipo: 'EXTERNO',
          nombre: `Carrier E2E ${fixture.suffix}`,
        })
        .expect(201),
    ]);

    spareVehicleId = vehicle.body.id;
    spareDriverId = driver.body.id;
    externalCarrierId = carrier.body.id;

    expect(spareVehicleId).toEqual(expect.any(Number));
    expect(spareDriverId).toEqual(expect.any(Number));
    expect(externalCarrierId).toEqual(expect.any(Number));
  });

  it('ADMIN crea el viaje interno principal', async () => {
    const response = await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.admin))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'INTERNO',
        observaciones: 'Viaje E2E principal',
        paradas: [
          {
            ordenDespachoId: fixture.mainDispatch.orden.id,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: fixture.mainDispatch.detalle.id,
                cantidadPlanificada: 6,
              },
            ],
          },
        ],
      })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      numero: expect.stringMatching(/^ENV-\d{6}$/),
    });

    mainShipmentId = response.body.id;

    const detail = await request(app.getHttpServer())
      .get(`/envios/${mainShipmentId}`)
      .set(auth(tokens.admin))
      .expect(200);

    expect(detail.body.estado).toBe('PROGRAMADO');
    expect(detail.body.progreso).toEqual({
      paradas: 1,
      paradasAtendidas: 0,
      unidadesPlanificadas: 6,
      unidadesCargadas: 0,
    });

    mainLoadId = detail.body.paradas[0].cargas[0].id;
  });

  it('impide sobreplanificar una línea ya comprometida por otro viaje', async () => {
    const response = await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.admin))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'INTERNO',
        paradas: [
          {
            ordenDespachoId: fixture.mainDispatch.orden.id,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: fixture.mainDispatch.detalle.id,
                cantidadPlanificada: 5,
              },
            ],
          },
        ],
      })
      .expect(409);

    expect(response.body.code).toBe('TRANSPORT_QUANTITY_EXCEEDED');
  });

  it('permite planificar exactamente el remanente disponible', async () => {
    const response = await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.bodega))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'INTERNO',
        paradas: [
          {
            ordenDespachoId: fixture.mainDispatch.orden.id,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: fixture.mainDispatch.detalle.id,
                cantidadPlanificada: 4,
              },
            ],
          },
        ],
      })
      .expect(201);

    secondaryShipmentId = response.body.id;

    const detail = await request(app.getHttpServer())
      .get(`/envios/${secondaryShipmentId}`)
      .set(auth(tokens.admin))
      .expect(200);

    secondaryLoadId = detail.body.paradas[0].cargas[0].id;
  });

  it('crea un viaje del otro vendedor para validar aislamiento de scope', async () => {
    const response = await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.admin))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'INTERNO',
        paradas: [
          {
            ordenDespachoId: fixture.otherDispatch.orden.id,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: fixture.otherDispatch.detalle.id,
                cantidadPlanificada: 5,
              },
            ],
          },
        ],
      })
      .expect(201);

    otherSellerShipmentId = response.body.id;
  });

  it('VENDEDOR ve su viaje y no puede leer el viaje de otro vendedor', async () => {
    await request(app.getHttpServer())
      .get(`/envios/${mainShipmentId}`)
      .set(auth(tokens.vendedor))
      .expect(200);

    const denied = await request(app.getHttpServer())
      .get(`/envios/${otherSellerShipmentId}`)
      .set(auth(tokens.vendedor))
      .expect(404);

    expect(denied.body.code).toBe('TRANSPORT_NOT_FOUND');
  });

  it('REPARTIDOR no ve un viaje antes de ser responsable', async () => {
    const response = await request(app.getHttpServer())
      .get(`/envios/${mainShipmentId}`)
      .set(auth(tokens.repartidor))
      .expect(404);

    expect(response.body.code).toBe('TRANSPORT_NOT_FOUND');
  });

  it('VENDEDOR agrega observación solo a un viaje dentro de su scope', async () => {
    const key = `E2E-OBS-OWN-${fixture.suffix}`;

    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/observaciones`)
      .set(auth(tokens.vendedor))
      .send({
        detalle: 'Observación E2E del vendedor',
        claveIdempotencia: key,
      })
      .expect(201);

    const event = await prisma.envioEvento.findUnique({
      where: {
        claveIdempotencia: key,
      },
    });

    expect(event).toEqual(
      expect.objectContaining({
        envioId: mainShipmentId,
        usuarioId: fixture.vendedor.id,
        tipo: 'OBSERVACION',
      }),
    );
  });

  it('VENDEDOR no puede escribir observaciones en viaje ajeno', async () => {
    const key = `E2E-OBS-OTHER-${fixture.suffix}`;

    const response = await request(app.getHttpServer())
      .post(`/envios/${otherSellerShipmentId}/observaciones`)
      .set(auth(tokens.vendedor))
      .send({
        detalle: 'No debe persistirse',
        claveIdempotencia: key,
      })
      .expect(404);

    expect(response.body.code).toBe('TRANSPORT_NOT_FOUND');

    expect(
      await prisma.envioEvento.findUnique({
        where: {
          claveIdempotencia: key,
        },
      }),
    ).toBeNull();
  });

  it('asigna recursos internos por HTTP y la repetición es idempotente', async () => {
    const key = `E2E-ASSIGN-MAIN-${fixture.suffix}`;
    const payload = {
      vehiculoId: fixture.vehiculo.id,
      conductorId: fixture.conductor.id,
      responsableId: fixture.repartidor.id,
      claveIdempotencia: key,
    };

    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/asignar`)
      .set(auth(tokens.admin))
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/asignar`)
      .set(auth(tokens.admin))
      .send(payload)
      .expect(201);

    const [shipment, vehicle, driver, events] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: { id: mainShipmentId },
      }),
      prisma.vehiculo.findUniqueOrThrow({
        where: { id: fixture.vehiculo.id },
      }),
      prisma.conductor.findUniqueOrThrow({
        where: { id: fixture.conductor.id },
      }),
      prisma.envioEvento.count({
        where: {
          envioId: mainShipmentId,
          claveIdempotencia: key,
        },
      }),
    ]);

    expect(shipment.estado).toBe('ASIGNADO');
    expect(shipment.version).toBe(1);
    expect(vehicle.estado).toBe('RESERVADO');
    expect(driver.estado).toBe('ASIGNADO');
    expect(events).toBe(1);
  });

  it('CONTABILIDAD no puede asignar recursos', async () => {
    await request(app.getHttpServer())
      .post(`/envios/${otherSellerShipmentId}/asignar`)
      .set(auth(tokens.contabilidad))
      .send({
        vehiculoId: spareVehicleId,
        conductorId: spareDriverId,
        responsableId: fixture.repartidorOtro.id,
        claveIdempotencia: `E2E-FORBIDDEN-ASSIGN-${fixture.suffix}`,
      })
      .expect(403);
  });

  it('asigna el segundo viaje con recursos independientes', async () => {
    await request(app.getHttpServer())
      .post(`/envios/${secondaryShipmentId}/asignar`)
      .set(auth(tokens.bodega))
      .send({
        vehiculoId: spareVehicleId,
        conductorId: spareDriverId,
        responsableId: fixture.repartidorOtro.id,
        claveIdempotencia: `E2E-ASSIGN-SECOND-${fixture.suffix}`,
      })
      .expect(201);

    const row = await prisma.envio.findUniqueOrThrow({
      where: { id: secondaryShipmentId },
    });

    expect(row.estado).toBe('ASIGNADO');
    expect(row.responsableId).toBe(fixture.repartidorOtro.id);
  });

  it('REPARTIDOR responsable puede leer el viaje después de asignarlo', async () => {
    const response = await request(app.getHttpServer())
      .get(`/envios/${mainShipmentId}`)
      .set(auth(tokens.repartidor))
      .expect(200);

    expect(response.body.id).toBe(mainShipmentId);
  });

  it('REPARTIDOR no puede confirmar carga', async () => {
    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/confirmar-carga`)
      .set(auth(tokens.repartidor))
      .send({
        claveIdempotencia: `E2E-FORBIDDEN-LOAD-${fixture.suffix}`,
        lineas: [
          {
            cargaDetalleId: mainLoadId,
            cantidadCargada: 6,
          },
        ],
      })
      .expect(403);
  });

  it('BODEGA confirma carga y la repetición es idempotente', async () => {
    const key = `E2E-LOAD-MAIN-${fixture.suffix}`;
    const payload = {
      claveIdempotencia: key,
      lineas: [
        {
          cargaDetalleId: mainLoadId,
          cantidadCargada: 6,
        },
      ],
    };

    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/confirmar-carga`)
      .set(auth(tokens.bodega))
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/confirmar-carga`)
      .set(auth(tokens.bodega))
      .send(payload)
      .expect(201);

    const [shipment, load, eventCount] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: { id: mainShipmentId },
      }),
      prisma.envioCargaDetalle.findUniqueOrThrow({
        where: { id: mainLoadId },
      }),
      prisma.envioEvento.count({
        where: {
          envioId: mainShipmentId,
          claveIdempotencia: key,
        },
      }),
    ]);

    expect(shipment.estado).toBe('CARGADO');
    expect(shipment.version).toBe(2);
    expect(load.cantidadCargada).toBe(6);
    expect(eventCount).toBe(1);
  });

  it('impide sobrecargar físicamente una línea entre varios viajes', async () => {
    const response = await request(app.getHttpServer())
      .post(`/envios/${secondaryShipmentId}/confirmar-carga`)
      .set(auth(tokens.bodega))
      .send({
        claveIdempotencia: `E2E-LOAD-SECOND-${fixture.suffix}`,
        lineas: [
          {
            cargaDetalleId: secondaryLoadId,
            cantidadCargada: 4,
          },
        ],
      })
      .expect(409);

    expect(response.body.code).toBe('TRANSPORT_QUANTITY_EXCEEDED');

    const [shipment, load] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: { id: secondaryShipmentId },
      }),
      prisma.envioCargaDetalle.findUniqueOrThrow({
        where: { id: secondaryLoadId },
      }),
    ]);

    expect(shipment.estado).toBe('ASIGNADO');
    expect(load.cantidadCargada).toBe(0);
  });

  it('cancela el segundo viaje y libera sus recursos', async () => {
    await request(app.getHttpServer())
      .post(`/envios/${secondaryShipmentId}/cancelar`)
      .set(auth(tokens.bodega))
      .send({
        motivo: 'Cancelación E2E del viaje secundario',
        claveIdempotencia: `E2E-CANCEL-SECOND-${fixture.suffix}`,
      })
      .expect(201);

    const [shipment, vehicle, driver] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: { id: secondaryShipmentId },
      }),
      prisma.vehiculo.findUniqueOrThrow({
        where: { id: spareVehicleId },
      }),
      prisma.conductor.findUniqueOrThrow({
        where: { id: spareDriverId },
      }),
    ]);

    expect(shipment.estado).toBe('CANCELADO');
    expect(vehicle.estado).toBe('DISPONIBLE');
    expect(driver.estado).toBe('DISPONIBLE');
  });

  it('otro REPARTIDOR no puede iniciar una ruta ajena', async () => {
    const response = await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/iniciar-ruta`)
      .set(auth(tokens.repartidorOtro))
      .send({
        claveIdempotencia: `E2E-WRONG-ROUTE-${fixture.suffix}`,
      })
      .expect(404);

    expect(response.body.code).toBe('TRANSPORT_NOT_FOUND');
  });

  it('REPARTIDOR responsable inicia la ruta', async () => {
    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/iniciar-ruta`)
      .set(auth(tokens.repartidor))
      .send({
        claveIdempotencia: `E2E-START-MAIN-${fixture.suffix}`,
        latitud: 15.6666667,
        longitud: -91.7111111,
      })
      .expect(201);

    const [shipment, vehicle, driver] = await Promise.all([
      prisma.envio.findUniqueOrThrow({
        where: { id: mainShipmentId },
      }),
      prisma.vehiculo.findUniqueOrThrow({
        where: { id: fixture.vehiculo.id },
      }),
      prisma.conductor.findUniqueOrThrow({
        where: { id: fixture.conductor.id },
      }),
    ]);

    expect(shipment.estado).toBe('EN_RUTA');
    expect(vehicle.estado).toBe('EN_RUTA');
    expect(driver.estado).toBe('EN_RUTA');
  });

  it('detalle HTTP incorpora trackingActual del responsable', async () => {
    const capturedAt = new Date();

    const session = await prisma.sesionTrackingUsuario.create({
      data: {
        usuarioId: fixture.repartidor.id,
        estado: 'ACTIVA',
        dispositivoId: `e2e-device-${fixture.suffix}`,
        plataforma: 'android',
      },
    });

    await prisma.ubicacionUsuarioActual.create({
      data: {
        sesionId: session.id,
        usuarioId: fixture.repartidor.id,
        latitud: 15.67,
        longitud: -91.71,
        precisionM: 5,
        bateriaPct: 85,
        capturadoEn: capturedAt,
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/envios/${mainShipmentId}`)
      .set(auth(tokens.admin))
      .expect(200);

    expect(response.body.trackingActual).toEqual(
      expect.objectContaining({
        usuarioId: fixture.repartidor.id,
        sesionActiva: true,
        latitud: 15.67,
        longitud: -91.71,
        bateriaPct: 85,
        stale: false,
      }),
    );
  });

  let incidentId: number;

  it('VENDEDOR no puede reportar incidencias operativas', async () => {
    await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/incidencias`)
      .set(auth(tokens.vendedor))
      .send({
        tipo: 'TRAFICO',
        severidad: 'MEDIA',
        descripcion: 'No autorizado',
        claveIdempotencia: `E2E-FORBIDDEN-INC-${fixture.suffix}`,
      })
      .expect(403);
  });

  it('REPARTIDOR reporta incidencia y la repetición conserva el mismo id', async () => {
    const key = `E2E-INC-MAIN-${fixture.suffix}`;
    const payload = {
      tipo: 'TRAFICO',
      severidad: 'MEDIA',
      descripcion: 'Tráfico E2E',
      latitud: 15.68,
      longitud: -91.7,
      claveIdempotencia: key,
    };

    const first = await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/incidencias`)
      .set(auth(tokens.repartidor))
      .send(payload)
      .expect(201);

    const repeated = await request(app.getHttpServer())
      .post(`/envios/${mainShipmentId}/incidencias`)
      .set(auth(tokens.repartidor))
      .send(payload)
      .expect(201);

    incidentId = first.body.id;

    expect(incidentId).toEqual(expect.any(Number));
    expect(repeated.body.id).toBe(incidentId);

    const shipment = await prisma.envio.findUniqueOrThrow({
      where: { id: mainShipmentId },
    });

    expect(shipment.estado).toBe('INCIDENCIA');
  });

  it('REPARTIDOR responsable resuelve la incidencia', async () => {
    await request(app.getHttpServer())
      .post(
        `/envios/${mainShipmentId}/incidencias/${incidentId}/resolver`,
      )
      .set(auth(tokens.repartidor))
      .send({
        resolucion: 'Ruta despejada en E2E',
        claveIdempotencia: `E2E-RESOLVE-INC-${fixture.suffix}`,
      })
      .expect(201);

    const [incident, shipment] = await Promise.all([
      prisma.envioIncidencia.findUniqueOrThrow({
        where: { id: incidentId },
      }),
      prisma.envio.findUniqueOrThrow({
        where: { id: mainShipmentId },
      }),
    ]);

    expect(incident.estado).toBe('RESUELTA');
    expect(shipment.estado).toBe('EN_RUTA');
  });

  it('no permite desactivar un vehículo EN_RUTA', async () => {
    const response = await request(app.getHttpServer())
      .post(`/vehiculos/${fixture.vehiculo.id}/desactivar`)
      .set(auth(tokens.admin))
      .send({
        motivo: 'Intento E2E con recurso ocupado',
      })
      .expect(409);

    expect(response.body.code).toBe('TRANSPORT_RESOURCE_UNAVAILABLE');
  });

  it('permite desactivar un vehículo liberado', async () => {
    await request(app.getHttpServer())
      .post(`/vehiculos/${spareVehicleId}/desactivar`)
      .set(auth(tokens.admin))
      .send({
        motivo: 'Baja E2E después de liberación',
      })
      .expect(201);

    const vehicle = await prisma.vehiculo.findUniqueOrThrow({
      where: { id: spareVehicleId },
    });

    expect(vehicle.activo).toBe(false);
    expect(vehicle.estado).toBe('INACTIVO');
  });

  it('crea, asigna y cancela un envío EXTERNO por HTTP', async () => {
    const created = await request(app.getHttpServer())
      .post('/envios')
      .set(auth(tokens.admin))
      .send({
        bodegaId: fixture.bodega.id,
        modalidad: 'EXTERNO',
        guia: `GUIA-E2E-${fixture.suffix}`,
        costo: 75,
        paradas: [
          {
            ordenDespachoId: fixture.secondDispatch.orden.id,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: fixture.secondDispatch.detalle.id,
                cantidadPlanificada: 5,
              },
            ],
          },
        ],
      })
      .expect(201);

    externalShipmentId = created.body.id;

    const missingCarrier = await request(app.getHttpServer())
      .post(`/envios/${externalShipmentId}/asignar`)
      .set(auth(tokens.admin))
      .send({
        claveIdempotencia: `E2E-EXT-NO-CARRIER-${fixture.suffix}`,
      })
      .expect(422);

    expect(missingCarrier.body.code).toBe('TRANSPORT_VALIDATION_ERROR');

    await request(app.getHttpServer())
      .post(`/envios/${externalShipmentId}/asignar`)
      .set(auth(tokens.admin))
      .send({
        transportistaId: externalCarrierId,
        claveIdempotencia: `E2E-EXT-ASSIGN-${fixture.suffix}`,
      })
      .expect(201);

    const assigned = await prisma.envio.findUniqueOrThrow({
      where: { id: externalShipmentId },
    });

    expect(assigned.estado).toBe('ASIGNADO');
    expect(assigned.modalidad).toBe('EXTERNO');
    expect(assigned.transportistaId).toBe(externalCarrierId);
    expect(assigned.vehiculoId).toBeNull();
    expect(assigned.conductorId).toBeNull();

    await request(app.getHttpServer())
      .post(`/envios/${externalShipmentId}/cancelar`)
      .set(auth(tokens.admin))
      .send({
        motivo: 'Cancelación externa E2E',
        claveIdempotencia: `E2E-EXT-CANCEL-${fixture.suffix}`,
      })
      .expect(201);
  });

  it('expone resumen y reporte operacional con roles correctos', async () => {
    const [summary, report] = await Promise.all([
      request(app.getHttpServer())
        .get('/envios/resumen')
        .set(auth(tokens.admin))
        .expect(200),

      request(app.getHttpServer())
        .get('/envios/reportes/operacion')
        .set(auth(tokens.contabilidad))
        .expect(200),
    ]);

    expect(summary.body).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        porEstado: expect.any(Object),
        unidades: expect.any(Object),
        incidenciasAbiertas: expect.any(Number),
      }),
    );

    expect(report.body).toEqual(
      expect.objectContaining({
        totalEnvios: expect.any(Number),
        modalidad: expect.any(Object),
        puntualidadSalida: expect.any(Object),
        tiemposPromedioHoras: expect.any(Object),
      }),
    );

    await request(app.getHttpServer())
      .get('/envios/reportes/operacion')
      .set(auth(tokens.vendedor))
      .expect(403);
  });
});

function assertLocalDatabase(value?: string): void {
  if (!value) {
    throw new Error(
      'DATABASE_URL no está definida. La suite E2E usa la BD local configurada en .env.',
    );
  }

  const url = new URL(value);

  if (
    url.hostname !== 'localhost' &&
    url.hostname !== '127.0.0.1' &&
    url.hostname !== '::1'
  ) {
    throw new Error(
      `E2E rechazado: DATABASE_URL apunta a "${url.hostname}". ` +
        'Esta suite solo permite PostgreSQL local.',
    );
  }
}
