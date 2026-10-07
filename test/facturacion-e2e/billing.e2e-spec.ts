import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { JwtStrategy } from 'src/auth/jwt.strategy';
import { FacturacionModule } from 'src/modules/facturacion';
import {
  BillingIntegrationFixture,
  cleanupBillingIntegrationFixture,
  createBillingIntegrationFixture,
} from '../facturacion-integration/billing-fixture';

describe('Facturación HTTP E2E', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaClient;
  let jwt: JwtService;
  let fixture: BillingIntegrationFixture;
  let tokens: Record<string, string>;
  let invoiceId: number;
  let invoiceLineId: number;

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
        FacturacionModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    assertLocalDatabase(process.env.DATABASE_URL);

    prisma = new PrismaClient();
    await prisma.$connect();
    fixture = await createBillingIntegrationFixture(prisma);
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
    };
  });

  afterAll(async () => {
    if (prisma && fixture) {
      await cleanupBillingIntegrationFixture(prisma, fixture);
    }
    if (prisma) await prisma.$disconnect();
    if (app) await app.close();
  });

  const auth = (token: string) => ({
    Authorization: `Bearer ${token}`,
  });

  it('rechaza acceso sin JWT', async () => {
    await request(app.getHttpServer()).get('/facturas').expect(401);
  });

  it('expone candidatos paginados y marca configuración fiscal pendiente', async () => {
    const response = await request(app.getHttpServer())
      .get('/facturas/candidatos?page=1&limit=20')
      .set(auth(tokens.contabilidad))
      .expect(200);

    expect(response.body.meta).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 20,
        total: expect.any(Number),
      }),
    );

    const candidate = response.body.data.find(
      (item: any) => item.entrega.id === fixture.entregas[0].id,
    );

    expect(candidate).toEqual(
      expect.objectContaining({
        facturable: true,
        fiscalReady: false,
        cliente: expect.objectContaining({
          id: fixture.base.cliente.id,
          fiscalReady: false,
        }),
      }),
    );
    expect(candidate.lineas[0].disponibleFacturar).toBe(10);
  });

  it('VENDEDOR solo ve candidatos de sus pedidos', async () => {
    const own = await request(app.getHttpServer())
      .get('/facturas/candidatos?page=1&limit=20')
      .set(auth(tokens.vendedor))
      .expect(200);

    expect(
      own.body.data.some(
        (item: any) => item.pedido.id === fixture.base.pedido.id,
      ),
    ).toBe(true);

    const other = await request(app.getHttpServer())
      .get('/facturas/candidatos?page=1&limit=20')
      .set(auth(tokens.vendedorOtro))
      .expect(200);

    expect(
      other.body.data.some(
        (item: any) => item.pedido.id === fixture.base.pedido.id,
      ),
    ).toBe(false);
  });

  it('VENDEDOR no puede crear facturas', async () => {
    await request(app.getHttpServer())
      .post('/facturas')
      .set(auth(tokens.vendedor))
      .send({
        entregaIds: [fixture.entregas[0].id],
        lineas: [
          {
            entregaDetalleId: fixture.entregas[0].detalles[0].id,
            cantidad: 6,
          },
        ],
        claveIdempotencia: `E2E-BILL-FORBIDDEN-${fixture.base.tag}`,
      })
      .expect(403);
  });

  it('configura emisor, establecimiento, receptor y producto por HTTP', async () => {
    await request(app.getHttpServer())
      .put('/configuracion-fiscal/empresa')
      .set(auth(tokens.admin))
      .send({
        empresaId: fixture.base.empresa.id,
        nit: `6${fixture.base.empresa.id}12345`,
        razonSocial: `MARCAS E2E ${fixture.base.tag}`,
        afiliacionIva: 'GEN',
        correoFiscal: `${fixture.base.tag}-fel@e2e.test`,
        direccion: 'Dirección fiscal E2E',
        municipio: 'Jacaltenango',
        departamento: 'Huehuetenango',
        pais: 'GT',
        preciosIncluyenImpuestos: true,
        tasaIvaDefault: '12.0000',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/configuracion-fiscal/establecimientos')
      .set(auth(tokens.admin))
      .send({
        empresaId: fixture.base.empresa.id,
        codigoSat: 1,
        nombreComercial: 'MARCAS E2E',
        direccion: 'Dirección establecimiento E2E',
        municipio: 'Jacaltenango',
        departamento: 'Huehuetenango',
        pais: 'GT',
        esPrincipal: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/configuracion-fiscal/clientes/${fixture.base.cliente.id}`)
      .set(auth(tokens.contabilidad))
      .send({
        tipoIdentificacion: 'NIT',
        identificacion: `5${fixture.base.cliente.id}12345`,
        nombreFiscal: 'Cliente Fiscal E2E',
        correoFiscal: `${fixture.base.tag}-cliente@e2e.test`,
        direccion: 'Dirección cliente E2E',
        municipio: 'Jacaltenango',
        departamento: 'Huehuetenango',
        pais: 'GT',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/configuracion-fiscal/productos/${fixture.base.producto.id}`)
      .set(auth(tokens.contabilidad))
      .send({
        bienOServicio: 'BIEN',
        unidadMedida: 'UN',
        descripcionFiscal: 'Producto facturable E2E',
        nombreCortoImpuesto: 'IVA',
        codigoUnidadGravable: 1,
        activo: true,
      })
      .expect(200);

    const candidate = await request(app.getHttpServer())
      .get('/facturas/candidatos?page=1&limit=20')
      .set(auth(tokens.contabilidad))
      .expect(200);

    const row = candidate.body.data.find(
      (item: any) => item.entrega.id === fixture.entregas[0].id,
    );

    expect(row.fiscalReady).toBe(true);
    expect(row.advertencias).toEqual([]);
  });

  it('CONTABILIDAD crea un borrador y el retry HTTP es idempotente', async () => {
    const payload = {
      entregaIds: [fixture.entregas[0].id],
      lineas: [
        {
          entregaDetalleId: fixture.entregas[0].detalles[0].id,
          cantidad: 6,
        },
      ],
      claveIdempotencia: `E2E-BILL-CREATE-${fixture.base.tag}`,
    };

    const first = await request(app.getHttpServer())
      .post('/facturas')
      .set(auth(tokens.contabilidad))
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/facturas')
      .set(auth(tokens.contabilidad))
      .send(payload)
      .expect(201);

    invoiceId = first.body.id;
    invoiceLineId = first.body.detalles[0].id;

    expect(second.body.id).toBe(invoiceId);
    expect(first.body.estado).toBe('BORRADOR');
    expect(first.body.totales).toEqual({
      subtotal: '60.00',
      descuento: '6.00',
      impuestos: '0.00',
      total: '54.00',
    });

    expect(
      await prisma.factura.count({
        where: {
          claveIdempotencia: payload.claveIdempotencia,
        },
      }),
    ).toBe(1);
  });

  it('VENDEDOR propietario puede leer y otro vendedor queda fuera del scope', async () => {
    await request(app.getHttpServer())
      .get(`/facturas/${invoiceId}`)
      .set(auth(tokens.vendedor))
      .expect(200);

    const denied = await request(app.getHttpServer())
      .get(`/facturas/${invoiceId}`)
      .set(auth(tokens.vendedorOtro))
      .expect(404);

    expect(denied.body.code).toBe('BILLING_NOT_FOUND');
  });

  it('la cantidad restante queda visible y un exceso devuelve conflicto', async () => {
    const candidates = await request(app.getHttpServer())
      .get('/facturas/candidatos?page=1&limit=20')
      .set(auth(tokens.contabilidad))
      .expect(200);

    const candidate = candidates.body.data.find(
      (item: any) => item.entrega.id === fixture.entregas[0].id,
    );

    expect(candidate.lineas[0]).toEqual(
      expect.objectContaining({
        entregada: 10,
        facturada: 6,
        disponibleFacturar: 4,
      }),
    );

    const exceeded = await request(app.getHttpServer())
      .post('/facturas')
      .set(auth(tokens.contabilidad))
      .send({
        entregaIds: [fixture.entregas[0].id],
        lineas: [
          {
            entregaDetalleId: fixture.entregas[0].detalles[0].id,
            cantidad: 5,
          },
        ],
        claveIdempotencia: `E2E-BILL-EXCEEDED-${fixture.base.tag}`,
      })
      .expect(409);

    expect(exceeded.body.code).toBe('BILLABLE_QUANTITY_EXCEEDED');
  });

  it('prepara el DTE sin fingir certificación de Grupo CDS', async () => {
    const prepared = await request(app.getHttpServer())
      .post(`/facturas/${invoiceId}/preparar`)
      .set(auth(tokens.contabilidad))
      .send({
        tipoDte: 'FACT',
        entorno: 'PRUEBAS',
        serieInterna: 'FEL-E2E',
      })
      .expect(201);

    expect(prepared.body.documentoFiscal).toEqual(
      expect.objectContaining({
        facturaId: invoiceId,
        serieInterna: 'FEL-E2E',
        numeroInterno: 1,
        estado: 'PREPARADO',
      }),
    );

    expect(prepared.body.factura.estado).toBe('LISTA_EMISION');
    expect(prepared.body.factura.fiscal).toEqual(
      expect.objectContaining({
        estado: 'PREPARADO',
        proveedor: null,
      }),
    );
    expect(prepared.body.factura.detalles[0]).toEqual(
      expect.objectContaining({
        id: invoiceLineId,
        impuestoTotal: '5.79',
      }),
    );
    expect(prepared.body.integracionFel).toEqual(
      expect.objectContaining({
        habilitada: false,
        proveedorPreferido: 'GRUPO_CDS',
      }),
    );

    const document = await prisma.documentoFiscal.findUniqueOrThrow({
      where: { facturaId: invoiceId },
      include: {
        eventos: true,
      },
    });

    expect(document.uuid).toBeNull();
    expect(document.estado).toBe('PREPARADO');
    expect(document.eventos).toHaveLength(2);
  });

  it('no permite descartar una factura ya preparada', async () => {
    const response = await request(app.getHttpServer())
      .post(`/facturas/${invoiceId}/descartar`)
      .set(auth(tokens.contabilidad))
      .send({
        motivo: 'No debe permitirse después de preparar',
        claveIdempotencia: `E2E-BILL-DISCARD-PREPARED-${fixture.base.tag}`,
      })
      .expect(409);

    expect(response.body.code).toBe('BILLING_INVALID_STATE');
  });

  it('un borrador adicional puede descartarse y libera la cantidad', async () => {
    const created = await request(app.getHttpServer())
      .post('/facturas')
      .set(auth(tokens.contabilidad))
      .send({
        entregaIds: [fixture.entregas[0].id],
        lineas: [
          {
            entregaDetalleId: fixture.entregas[0].detalles[0].id,
            cantidad: 4,
          },
        ],
        claveIdempotencia: `E2E-BILL-DRAFT-REMAINDER-${fixture.base.tag}`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/facturas/${created.body.id}/descartar`)
      .set(auth(tokens.contabilidad))
      .send({
        motivo: 'Borrador de prueba descartado',
        claveIdempotencia: `E2E-BILL-DISCARD-${fixture.base.tag}`,
      })
      .expect(201);

    const candidates = await request(app.getHttpServer())
      .get('/facturas/candidatos?page=1&limit=20')
      .set(auth(tokens.contabilidad))
      .expect(200);

    const candidate = candidates.body.data.find(
      (item: any) => item.entrega.id === fixture.entregas[0].id,
    );

    expect(candidate.lineas[0].disponibleFacturar).toBe(4);
  });

  it('expone auditoría, resumen y reporte operativo', async () => {
    const [events, summary, report, operations] = await Promise.all([
      request(app.getHttpServer())
        .get(`/facturas/${invoiceId}/eventos?page=1&limit=20`)
        .set(auth(tokens.contabilidad))
        .expect(200),
      request(app.getHttpServer())
        .get('/facturas/resumen')
        .set(auth(tokens.admin))
        .expect(200),
      request(app.getHttpServer())
        .get('/facturas/reportes/operacion')
        .set(auth(tokens.contabilidad))
        .expect(200),
      request(app.getHttpServer())
        .get(`/facturas/${invoiceId}/operaciones-fel?page=1&limit=20`)
        .set(auth(tokens.contabilidad))
        .expect(200),
    ]);

    expect(events.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tipo: 'CREADA' }),
        expect.objectContaining({ tipo: 'PREPARADA' }),
      ]),
    );

    expect(summary.body).toEqual(
      expect.objectContaining({
        total: 2,
        porEstado: expect.objectContaining({
          LISTA_EMISION: 1,
          DESCARTADA: 1,
        }),
        montos: {
          facturado: '54.00',
          impuestos: '5.79',
          descuentos: '6.00',
        },
        fel: expect.any(Object),
        cartera: expect.any(Object),
      }),
    );

    expect(report.body).toEqual(
      expect.objectContaining({
        rango: expect.any(Object),
        facturas: expect.any(Array),
        documentosFiscales: expect.any(Array),
        operacionesFel: expect.any(Array),
        integracionExterna: expect.objectContaining({
          habilitada: false,
        }),
      }),
    );

    expect(operations.body.data).toEqual([]);
  });

  it('limita reporte operacional a ADMIN y CONTABILIDAD', async () => {
    await request(app.getHttpServer())
      .get('/facturas/reportes/operacion')
      .set(auth(tokens.vendedor))
      .expect(403);

    await request(app.getHttpServer())
      .get('/facturas')
      .set(auth(tokens.bodega))
      .expect(403);
  });
});

function assertLocalDatabase(value?: string): void {
  if (!value) {
    throw new Error('DATABASE_URL no está definida.');
  }

  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(
      `Facturación E2E rechazada: DATABASE_URL apunta a "${url.hostname}". Solo PostgreSQL local.`,
    );
  }
}
