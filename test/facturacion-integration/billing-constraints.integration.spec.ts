import { PrismaClient } from '@prisma/client';
import { createIntegrationPrisma } from '../transporte-integration/integration-db';
import {
  BillingIntegrationFixture,
  cleanupBillingIntegrationFixture,
  configureBillingFiscalProfiles,
  createBillingIntegrationFixture,
} from './billing-fixture';

describe('Facturación constraints / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: BillingIntegrationFixture | null = null;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    fixture = await createBillingIntegrationFixture(prisma);
  });

  afterEach(async () => {
    if (!fixture) return;
    await cleanupBillingIntegrationFixture(prisma, fixture);
    fixture = null;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function createInvoice() {
    const f = fixture!;
    return prisma.factura.create({
      data: {
        empresaId: f.base.empresa.id,
        clienteId: f.base.cliente.id,
        pedidoId: f.base.pedido.id,
        creadoPorId: f.contabilidad.id,
        estado: 'BORRADOR',
        condicionPago: 'CREDITO',
        moneda: 'GTQ',
        subtotal: 100,
        descuentoTotal: 10,
        impuestoTotal: 0,
        total: 90,
        claveIdempotencia: `${f.base.tag}:constraint:invoice`,
      },
    });
  }

  it('CHECK rechaza montos negativos en Factura', async () => {
    const f = fixture!;

    await expect(
      prisma.factura.create({
        data: {
          empresaId: f.base.empresa.id,
          clienteId: f.base.cliente.id,
          pedidoId: f.base.pedido.id,
          estado: 'BORRADOR',
          moneda: 'GTQ',
          subtotal: -1,
          descuentoTotal: 0,
          impuestoTotal: 0,
          total: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza cantidad cero en FacturaDetalle', async () => {
    const f = fixture!;
    const invoice = await createInvoice();

    await expect(
      prisma.facturaDetalle.create({
        data: {
          facturaId: invoice.id,
          productoId: f.base.producto.id,
          pedidoDetalleId: f.base.pedidoDetalle.id,
          entregaDetalleId: f.entregas[0].detalles[0].id,
          descripcion: 'Detalle inválido',
          bienOServicio: 'BIEN',
          unidadMedida: 'UN',
          cantidad: 0,
          precioUnitario: 10,
          precioBruto: 0,
          descuento: 0,
          impuestoTotal: 0,
          totalLinea: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza tasa fiscal mayor a 100', async () => {
    const f = fixture!;

    await expect(
      prisma.empresaPerfilFiscal.create({
        data: {
          empresaId: f.base.empresa.id,
          nit: `7${f.base.empresa.id}12345`,
          razonSocial: 'Empresa inválida',
          afiliacionIva: 'GEN',
          direccion: 'Dirección',
          municipio: 'Jacaltenango',
          departamento: 'Huehuetenango',
          pais: 'GT',
          preciosIncluyenImpuestos: true,
          tasaIvaDefault: 101,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza clave de idempotencia vacía en FacturaEvento', async () => {
    const f = fixture!;
    const invoice = await createInvoice();

    await expect(
      prisma.facturaEvento.create({
        data: {
          facturaId: invoice.id,
          usuarioId: f.contabilidad.id,
          tipo: 'OBSERVACION',
          estado: 'BORRADOR',
          detalle: 'Evento inválido',
          claveIdempotencia: '   ',
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza tasa de impuesto por detalle mayor a 100', async () => {
    const f = fixture!;
    const invoice = await createInvoice();

    const detail = await prisma.facturaDetalle.create({
      data: {
        facturaId: invoice.id,
        productoId: f.base.producto.id,
        pedidoDetalleId: f.base.pedidoDetalle.id,
        entregaDetalleId: f.entregas[0].detalles[0].id,
        descripcion: 'Detalle válido',
        bienOServicio: 'BIEN',
        unidadMedida: 'UN',
        cantidad: 1,
        precioUnitario: 10,
        precioBruto: 10,
        descuento: 0,
        impuestoTotal: 0,
        totalLinea: 10,
      },
    });

    await expect(
      prisma.facturaDetalleImpuesto.create({
        data: {
          facturaDetalleId: detail.id,
          nombreCorto: 'IVA',
          codigoUnidadGravable: 1,
          tasa: 101,
          montoGravable: 8.92857143,
          montoImpuesto: 1.07142857,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK exige fecha cuando Factura queda DESCARTADA', async () => {
    const f = fixture!;

    await expect(
      prisma.factura.create({
        data: {
          empresaId: f.base.empresa.id,
          clienteId: f.base.cliente.id,
          pedidoId: f.base.pedido.id,
          creadoPorId: f.contabilidad.id,
          estado: 'DESCARTADA',
          condicionPago: 'CREDITO',
          moneda: 'GTQ',
          subtotal: 10,
          descuentoTotal: 0,
          impuestoTotal: 0,
          total: 10,
          descartadaEn: null,
          motivoDescarte: 'Inválida sin fecha',
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rechaza secuencia DTE con siguienteNumero no positivo', async () => {
    const f = fixture!;
    const fiscal = await configureBillingFiscalProfiles(prisma, f);

    await expect(
      prisma.dteSecuencia.create({
        data: {
          empresaId: f.base.empresa.id,
          establecimientoFiscalId: fiscal.establishment.id,
          entorno: 'PRUEBAS',
          serieInterna: 'BAD',
          siguienteNumero: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('CHECK impide marcar CERTIFICADO sin UUID, serie, número y fecha', async () => {
    const f = fixture!;
    const fiscal = await configureBillingFiscalProfiles(prisma, f);
    const invoice = await createInvoice();

    await expect(
      prisma.documentoFiscal.create({
        data: {
          facturaId: invoice.id,
          empresaId: f.base.empresa.id,
          establecimientoFiscalId: fiscal.establishment.id,
          tipoDte: 'FACT',
          estado: 'CERTIFICADO',
          entorno: 'PRUEBAS',
          codigoMoneda: 'GTQ',
          fechaHoraEmision: new Date(),
          granTotal: 90,
          serieInterna: 'FEL-CONSTRAINT',
          numeroInterno: 1,
          emisorNit: fiscal.company.nit,
          emisorNombre: fiscal.company.razonSocial,
          emisorNombreComercial: fiscal.establishment.nombreComercial,
          emisorAfiliacionIva: fiscal.company.afiliacionIva,
          emisorDireccion: { direccion: fiscal.establishment.direccion },
          receptorTipoIdentificacion: fiscal.customer.tipoIdentificacion,
          receptorIdentificacion: fiscal.customer.identificacion,
          receptorNombre: fiscal.customer.nombreFiscal,
          receptorDireccion: { direccion: fiscal.customer.direccion },
          payloadHash: 'a'.repeat(64),
        },
      }),
    ).rejects.toThrow();
  });
});
