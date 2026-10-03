import { PrismaClient } from '@prisma/client';
import { CreateInvoiceFromDeliveriesUseCase } from '../../src/modules/facturacion/application/use-cases/create-invoice-from-deliveries.use-case';
import { DiscardInvoiceUseCase } from '../../src/modules/facturacion/application/use-cases/discard-invoice.use-case';
import { PrepareInvoiceUseCase } from '../../src/modules/facturacion/application/use-cases/prepare-invoice.use-case';
import { BillingActorDirectoryPrismaAdapter } from '../../src/modules/facturacion/infrastructure/adapters/billing-actor-directory.prisma-adapter';
import { BillingProductDirectoryPrismaAdapter } from '../../src/modules/facturacion/infrastructure/adapters/billing-product-directory.prisma-adapter';
import { FiscalConfigPrismaAdapter } from '../../src/modules/facturacion/infrastructure/adapters/fiscal-config.prisma-adapter';
import { FiscalDocumentPrismaRepository } from '../../src/modules/facturacion/infrastructure/persistence/prisma/fiscal-document.prisma-repository';
import { InvoicePrismaRepository } from '../../src/modules/facturacion/infrastructure/persistence/prisma/invoice.prisma-repository';
import { DeliveryPrismaQueryAdapter } from '../../src/modules/entregas/infrastructure/persistence/prisma/delivery.prisma-query.adapter';
import { OrderBillingDirectoryAdapter } from '../../src/modules/pedidos/infrastructure/adapters/order-billing-directory.adapter';
import { createIntegrationPrisma } from '../transporte-integration/integration-db';
import {
  BillingIntegrationFixture,
  cleanupBillingIntegrationFixture,
  configureBillingFiscalProfiles,
  createBillingIntegrationFixture,
} from './billing-fixture';

describe('Facturación workflow / PostgreSQL integration', () => {
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

  function services() {
    const db: any = prisma;
    const invoices = new InvoicePrismaRepository(db);
    const actors = new BillingActorDirectoryPrismaAdapter(db);
    const deliveries = new DeliveryPrismaQueryAdapter(db);
    const orders = new OrderBillingDirectoryAdapter(db);
    const products = new BillingProductDirectoryPrismaAdapter(db);
    const fiscal = new FiscalConfigPrismaAdapter(db);
    const fiscalDocuments = new FiscalDocumentPrismaRepository(db);

    return {
      invoices,
      fiscal,
      create: new CreateInvoiceFromDeliveriesUseCase(
        invoices,
        actors,
        deliveries,
        orders,
        products,
      ),
      discard: new DiscardInvoiceUseCase(invoices, actors),
      prepare: new PrepareInvoiceUseCase(
        invoices,
        fiscalDocuments,
        actors,
        fiscal,
      ),
    };
  }

  it('crea una factura parcial idempotente desde cantidades realmente entregadas', async () => {
    const f = fixture!;
    const s = services();
    const delivery = f.entregas[0];
    const detail = delivery.detalles[0];
    const key = `${f.base.tag}:invoice:create:partial`;

    const command = {
      entregaIds: [delivery.id],
      lineas: [{ entregaDetalleId: detail.id, cantidad: 6 }],
      claveIdempotencia: key,
      actorId: f.contabilidad.id,
    };

    const first = await s.create.execute(command);
    const second = await s.create.execute(command);

    expect(second.id).toBe(first.id);
    expect(first.estado).toBe('BORRADOR');
    expect(first.subtotal).toBe('60.00');
    expect(first.descuentoTotal).toBe('6.00');
    expect(first.total).toBe('54.00');
    expect(first.detalles[0]).toEqual(
      expect.objectContaining({
        entregaDetalleId: detail.id,
        cantidad: 6,
        precioUnitario: '10.00',
        precioBruto: '60.00',
        descuento: '6.00',
        totalLinea: '54.00',
      }),
    );

    expect(
      await prisma.factura.count({
        where: { claveIdempotencia: key },
      }),
    ).toBe(1);

    expect(
      await prisma.facturaEvento.count({
        where: { facturaId: first.id, tipo: 'CREADA' },
      }),
    ).toBe(1);

    expect(
      await prisma.facturaEntrega.count({
        where: { facturaId: first.id, entregaId: delivery.id },
      }),
    ).toBe(1);
  });

  it('impide doble facturación concurrentemente visible sobre la misma entrega', async () => {
    const f = fixture!;
    const s = services();
    const delivery = f.entregas[0];
    const detail = delivery.detalles[0];

    await s.create.execute({
      entregaIds: [delivery.id],
      lineas: [{ entregaDetalleId: detail.id, cantidad: 6 }],
      claveIdempotencia: `${f.base.tag}:invoice:first`,
      actorId: f.contabilidad.id,
    });

    await expect(
      s.create.execute({
        entregaIds: [delivery.id],
        lineas: [{ entregaDetalleId: detail.id, cantidad: 5 }],
        claveIdempotencia: `${f.base.tag}:invoice:overflow`,
        actorId: f.contabilidad.id,
      }),
    ).rejects.toMatchObject({
      code: 'BILLABLE_QUANTITY_EXCEEDED',
    });

    expect(
      await prisma.facturaDetalle.aggregate({
        where: {
          entregaDetalleId: detail.id,
          factura: {
            estado: { in: ['BORRADOR', 'LISTA_EMISION', 'EMITIDA'] },
          },
        },
        _sum: { cantidad: true },
      }),
    ).toEqual(
      expect.objectContaining({
        _sum: { cantidad: 6 },
      }),
    );
  });

  it('libera la cantidad reservada al descartar un borrador y permite refacturarla', async () => {
    const f = fixture!;
    const s = services();
    const delivery = f.entregas[0];
    const detail = delivery.detalles[0];

    const draft = await s.create.execute({
      entregaIds: [delivery.id],
      lineas: [{ entregaDetalleId: detail.id, cantidad: 10 }],
      claveIdempotencia: `${f.base.tag}:invoice:discard-source`,
      actorId: f.contabilidad.id,
    });

    await s.discard.execute({
      id: draft.id,
      motivo: 'Borrador reemplazado durante integración',
      claveIdempotencia: `${f.base.tag}:invoice:discard`,
      actorId: f.contabilidad.id,
    });

    const replacement = await s.create.execute({
      entregaIds: [delivery.id],
      lineas: [{ entregaDetalleId: detail.id, cantidad: 10 }],
      claveIdempotencia: `${f.base.tag}:invoice:replacement`,
      actorId: f.contabilidad.id,
    });

    const discarded = await prisma.factura.findUniqueOrThrow({
      where: { id: draft.id },
    });

    expect(discarded.estado).toBe('DESCARTADA');
    expect(discarded.descartadaEn).toBeInstanceOf(Date);
    expect(replacement.estado).toBe('BORRADOR');
    expect(replacement.id).not.toBe(draft.id);
  });

  it('prepara DTE, persiste impuestos y asigna secuencia interna incremental', async () => {
    const f = fixture!;
    const s = services();
    const fiscal = await configureBillingFiscalProfiles(prisma, f);

    const firstDraft = await s.create.execute({
      entregaIds: [f.entregas[0].id],
      lineas: [
        {
          entregaDetalleId: f.entregas[0].detalles[0].id,
          cantidad: 10,
        },
      ],
      claveIdempotencia: `${f.base.tag}:invoice:prepare:a`,
      actorId: f.contabilidad.id,
    });

    const firstDocument = await s.prepare.execute({
      id: firstDraft.id,
      tipoDte: 'FACT',
      entorno: 'PRUEBAS',
      establecimientoId: fiscal.establishment.id,
      serieInterna: 'FEL-INT',
      actorId: f.contabilidad.id,
    });

    const secondDraft = await s.create.execute({
      entregaIds: [f.entregas[1].id],
      lineas: [
        {
          entregaDetalleId: f.entregas[1].detalles[0].id,
          cantidad: 10,
        },
      ],
      claveIdempotencia: `${f.base.tag}:invoice:prepare:b`,
      actorId: f.contabilidad.id,
    });

    const secondDocument = await s.prepare.execute({
      id: secondDraft.id,
      tipoDte: 'FACT',
      entorno: 'PRUEBAS',
      establecimientoId: fiscal.establishment.id,
      serieInterna: 'FEL-INT',
      actorId: f.contabilidad.id,
    });

    const [firstInvoice, firstDetail, storedDocument, sequence] =
      await Promise.all([
        prisma.factura.findUniqueOrThrow({
          where: { id: firstDraft.id },
        }),
        prisma.facturaDetalle.findFirstOrThrow({
          where: { facturaId: firstDraft.id },
          include: { impuestos: true },
        }),
        prisma.documentoFiscal.findUniqueOrThrow({
          where: { id: firstDocument.id },
        }),
        prisma.dteSecuencia.findUniqueOrThrow({
          where: {
            empresaId_establecimientoFiscalId_entorno_serieInterna: {
              empresaId: f.base.empresa.id,
              establecimientoFiscalId: fiscal.establishment.id,
              entorno: 'PRUEBAS',
              serieInterna: 'FEL-INT',
            },
          },
        }),
      ]);

    expect(firstDocument.numeroInterno).toBe(1);
    expect(secondDocument.numeroInterno).toBe(2);
    expect(sequence.siguienteNumero).toBe(3);

    expect(firstInvoice.estado).toBe('LISTA_EMISION');
    expect(firstInvoice.impuestoTotal.toFixed(2)).toBe('9.64');

    expect(firstDetail.impuestoTotal.toFixed(2)).toBe('9.64');
    expect(firstDetail.impuestos).toHaveLength(1);
    expect(firstDetail.impuestos[0]).toEqual(
      expect.objectContaining({
        nombreCorto: 'IVA',
        codigoUnidadGravable: 1,
      }),
    );
    expect(firstDetail.impuestos[0].tasa?.toFixed(4)).toBe('12.0000');

    expect(storedDocument.estado).toBe('PREPARADO');
    expect(storedDocument.proveedorFelConfigId).toBeNull();
    expect(storedDocument.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    expect(
      await prisma.facturaEvento.count({
        where: { facturaId: firstDraft.id, tipo: 'PREPARADA' },
      }),
    ).toBe(1);
    expect(
      await prisma.documentoFiscalEvento.count({
        where: { documentoFiscalId: firstDocument.id },
      }),
    ).toBe(2);
  });
});
