import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { TrackingModule } from 'src/modules/tracking';

function assertLocalDatabase(value?: string): void {
  if (!value) {
    throw new Error(
      'DATABASE_URL no está definida. Tracking E2E usa la BD local.',
    );
  }

  const url = new URL(value);

  if (
    url.hostname !== 'localhost' &&
    url.hostname !== '127.0.0.1' &&
    url.hostname !== '::1'
  ) {
    throw new Error(
      'Tracking E2E solo permite PostgreSQL local. Host=' + url.hostname,
    );
  }
}

async function createFixture(prisma: PrismaClient) {
  const tag =
    'tracking-e2e-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8);

  const admin = await prisma.usuario.create({
    data: {
      nombre: 'Admin ' + tag,
      correo: tag + '-admin@e2e.test',
      contrasena: 'e2e-only',
      rol: 'ADMIN',
      activo: true,
    },
  });

  const vendedor = await prisma.usuario.create({
    data: {
      nombre: 'Vendedor ' + tag,
      correo: tag + '-vendedor@e2e.test',
      contrasena: 'e2e-only',
      rol: 'VENDEDOR',
      activo: true,
    },
  });

  const repartidor = await prisma.usuario.create({
    data: {
      nombre: 'Repartidor ' + tag,
      correo: tag + '-repartidor@e2e.test',
      contrasena: 'e2e-only',
      rol: 'REPARTIDOR',
      activo: true,
    },
  });

  const bodega = await prisma.usuario.create({
    data: {
      nombre: 'Bodega ' + tag,
      correo: tag + '-bodega@e2e.test',
      contrasena: 'e2e-only',
      rol: 'BODEGA',
      activo: true,
    },
  });

  return { tag, admin, vendedor, repartidor, bodega };
}

async function cleanupFixture(
  prisma: PrismaClient,
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<void> {
  const userIds = [
    fixture.admin.id,
    fixture.vendedor.id,
    fixture.repartidor.id,
    fixture.bodega.id,
  ];

  const sessions = await prisma.sesionTrackingUsuario.findMany({
    where: { usuarioId: { in: userIds } },
    select: { id: true },
  });

  const sessionIds = sessions.map((row) => row.id);

  await prisma.ubicacionUsuarioActual.deleteMany({
    where: { usuarioId: { in: userIds } },
  });

  if (sessionIds.length) {
    await prisma.ubicacionUsuarioHistorial.deleteMany({
      where: { sesionId: { in: sessionIds } },
    });
  }

  await prisma.sesionTrackingUsuario.deleteMany({
    where: { usuarioId: { in: userIds } },
  });

  await prisma.asistencia.deleteMany({
    where: { usuarioId: { in: userIds } },
  });

  await prisma.usuario.deleteMany({
    where: { id: { in: userIds } },
  });
}

describe('Tracking/Jornada HTTP E2E', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let fixture: Awaited<ReturnType<typeof createFixture>>;
  let tokens: Record<string, string>;

  let sellerSessionId: number;
  let sellerAttendanceId: number;
  let secondSellerSessionId: number;
  let repartidorSessionId: number;
  let firstLocationId: number;

  beforeAll(async () => {
    assertLocalDatabase(process.env.DATABASE_URL);

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
        TrackingModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();

    fixture = await createFixture(prisma);
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
      admin: sign(fixture.admin),
      vendedor: sign(fixture.vendedor),
      repartidor: sign(fixture.repartidor),
      bodega: sign(fixture.bodega),
    };
  });

  afterAll(async () => {
    if (prisma && fixture) {
      await cleanupFixture(prisma, fixture);
    }

    if (prisma) await prisma.$disconnect();
    if (app) await app.close();
  });

  const auth = (token: string) => ({
    Authorization: 'Bearer ' + token,
  });

  it('rechaza tracking sin JWT', async () => {
    await request(app.getHttpServer())
      .get('/real-time-location/tracking/me')
      .expect(401);
  });

  it('BODEGA no puede iniciar tracking propio', async () => {
    await request(app.getHttpServer())
      .post('/real-time-location/tracking/start')
      .set(auth(tokens.bodega))
      .expect(403);
  });

  it('VENDEDOR inicia jornada y START retry conserva sesión', async () => {
    const first = await request(app.getHttpServer())
      .post('/real-time-location/tracking/start')
      .set(auth(tokens.vendedor))
      .expect(201);

    const retry = await request(app.getHttpServer())
      .post('/real-time-location/tracking/start')
      .set(auth(tokens.vendedor))
      .expect(201);

    sellerSessionId = first.body.sesionTrackingId;
    sellerAttendanceId = first.body.asistenciaId;

    expect(first.body.estado).toBe('ACTIVA');
    expect(retry.body.sesionTrackingId).toBe(sellerSessionId);
    expect(retry.body.asistenciaId).toBe(sellerAttendanceId);

    expect(
      await prisma.sesionTrackingUsuario.count({
        where: {
          usuarioId: fixture.vendedor.id,
          estado: 'ACTIVA',
        },
      }),
    ).toBe(1);
  });

  it('GET /me refleja sesión ACTIVA', async () => {
    const response = await request(app.getHttpServer())
      .get('/real-time-location/tracking/me')
      .set(auth(tokens.vendedor))
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        activo: true,
        sesionTrackingId: sellerSessionId,
        asistenciaId: sellerAttendanceId,
        estado: 'ACTIVA',
      }),
    );
  });

  it('APK registra GPS sin claveIdempotencia y retry conserva punto', async () => {
    const payload = {
      sesionTrackingId: sellerSessionId,
      latitud: 15.66,
      longitud: -91.71,
      precision: 5,
      velocidad: 1,
      bateria: 80,
      capturadoEn: new Date().toISOString(),
    };

    const first = await request(app.getHttpServer())
      .post('/real-time-location/tracking/location')
      .set(auth(tokens.vendedor))
      .send(payload)
      .expect(201);

    const retry = await request(app.getHttpServer())
      .post('/real-time-location/tracking/location')
      .set(auth(tokens.vendedor))
      .send(payload)
      .expect(201);

    firstLocationId = first.body.ubicacionId;

    expect(retry.body.ubicacionId).toBe(firstLocationId);

    expect(
      await prisma.ubicacionUsuarioHistorial.count({
        where: { sesionId: sellerSessionId },
      }),
    ).toBe(1);
  });

  it('rechaza coordenadas inválidas', async () => {
    await request(app.getHttpServer())
      .post('/real-time-location/tracking/location')
      .set(auth(tokens.vendedor))
      .send({
        sesionTrackingId: sellerSessionId,
        latitud: 95,
        longitud: -91.71,
        precision: 5,
        velocidad: 0,
        bateria: 80,
        capturadoEn: new Date().toISOString(),
      })
      .expect(400);
  });

  it('otro usuario no puede finalizar una sesión ajena', async () => {
    const response = await request(app.getHttpServer())
      .post('/real-time-location/tracking/start')
      .set(auth(tokens.repartidor))
      .expect(201);

    repartidorSessionId = response.body.sesionTrackingId;

    await request(app.getHttpServer())
      .post(
        '/real-time-location/tracking/' +
          repartidorSessionId +
          '/finish',
      )
      .set(auth(tokens.vendedor))
      .expect(404);
  });

  it('VENDEDOR finaliza y OFF retry es idempotente', async () => {
    const first = await request(app.getHttpServer())
      .post(
        '/real-time-location/tracking/' + sellerSessionId + '/finish',
      )
      .set(auth(tokens.vendedor))
      .expect(200);

    const retry = await request(app.getHttpServer())
      .post(
        '/real-time-location/tracking/' + sellerSessionId + '/finish',
      )
      .set(auth(tokens.vendedor))
      .expect(200);

    expect(first.body.estado).toBe('FINALIZADA');
    expect(retry.body.estado).toBe('FINALIZADA');
    expect(retry.body.finalizadoEn).toBe(first.body.finalizadoEn);
  });

  it('rechaza GPS posterior a OFF', async () => {
    await request(app.getHttpServer())
      .post('/real-time-location/tracking/location')
      .set(auth(tokens.vendedor))
      .send({
        sesionTrackingId: sellerSessionId,
        latitud: 15.67,
        longitud: -91.70,
        precision: 5,
        velocidad: 0,
        bateria: 79,
        capturadoEn: new Date().toISOString(),
      })
      .expect(409);
  });

  it('reactiva mismo día sobre misma jornada con nueva sesión', async () => {
    const response = await request(app.getHttpServer())
      .post('/real-time-location/tracking/start')
      .set(auth(tokens.vendedor))
      .expect(201);

    secondSellerSessionId = response.body.sesionTrackingId;

    expect(response.body.asistenciaId).toBe(sellerAttendanceId);
    expect(secondSellerSessionId).not.toBe(sellerSessionId);

    const attendance = await prisma.asistencia.findUniqueOrThrow({
      where: { id: sellerAttendanceId },
    });

    expect(attendance.salida).toBeNull();
  });

  it('retry de OFF antiguo no vuelve a cerrar jornada reabierta', async () => {
    await request(app.getHttpServer())
      .post(
        '/real-time-location/tracking/' + sellerSessionId + '/finish',
      )
      .set(auth(tokens.vendedor))
      .expect(200);

    const attendance = await prisma.asistencia.findUniqueOrThrow({
      where: { id: sellerAttendanceId },
    });

    expect(attendance.salida).toBeNull();
  });

  it('solo ADMIN consulta realtime e histórico', async () => {
    await request(app.getHttpServer())
      .get('/real-time-location/tracking/history')
      .set(auth(tokens.vendedor))
      .expect(403);

    const realtime = await request(app.getHttpServer())
      .get('/real-time-location/tracking/realtime')
      .set(auth(tokens.admin))
      .expect(200);

    const seller = realtime.body.find(
      (row: any) => row.usuario?.id === fixture.vendedor.id,
    );

    expect(seller).toEqual(
      expect.objectContaining({
        tecnico: expect.objectContaining({
          id: fixture.vendedor.id,
        }),
        usuario: expect.objectContaining({
          id: fixture.vendedor.id,
        }),
        tracking: expect.objectContaining({
          sesionId: secondSellerSessionId,
          asistenciaId: sellerAttendanceId,
          estado: 'ACTIVA',
        }),
      }),
    );
  });

  it('reportería devuelve jornada, detalle y trazado', async () => {
    const history = await request(app.getHttpServer())
      .get(
        '/real-time-location/tracking/history?usuarioId=' +
          fixture.vendedor.id +
          '&page=1&limit=25',
      )
      .set(auth(tokens.admin))
      .expect(200);

    expect(history.body.total).toBeGreaterThanOrEqual(1);

    expect(
      history.body.items.find(
        (row: any) => row.asistenciaId === sellerAttendanceId,
      ),
    ).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(
        '/real-time-location/tracking/attendance/' +
          sellerAttendanceId,
      )
      .set(auth(tokens.admin))
      .expect(200);

    expect(detail.body).toEqual(
      expect.objectContaining({
        asistencia: expect.objectContaining({
          id: sellerAttendanceId,
        }),
        resumen: expect.objectContaining({
          sesionesTotal: 2,
          haySesionActiva: true,
        }),
      }),
    );

    const route = await request(app.getHttpServer())
      .get(
        '/real-time-location/tracking/attendance/' +
          sellerAttendanceId +
          '/locations?page=1&limit=250',
      )
      .set(auth(tokens.admin))
      .expect(200);

    expect(route.body.total).toBe(1);

    expect(route.body.items[0]).toEqual(
      expect.objectContaining({
        id: firstLocationId,
        sesionTrackingId: sellerSessionId,
        latitud: 15.66,
        longitud: -91.71,
      }),
    );
  });

  it('REPARTIDOR finaliza su propia jornada', async () => {
    await request(app.getHttpServer())
      .post(
        '/real-time-location/tracking/' +
          repartidorSessionId +
          '/finish',
      )
      .set(auth(tokens.repartidor))
      .expect(200);
  });
});
