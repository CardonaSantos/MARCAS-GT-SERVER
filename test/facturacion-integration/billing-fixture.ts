import { PrismaClient } from '@prisma/client';
import {
  cleanupTransportIntegrationFixture,
  createTransportIntegrationFixture,
} from '../transporte-integration/transport-fixture';

export type BillingIntegrationFixture = Awaited<
  ReturnType<typeof createBillingIntegrationFixture>
>;

export async function createBillingIntegrationFixture(
  prisma: PrismaClient,
) {
  const base = await createTransportIntegrationFixture(prisma);

  const contabilidad = await prisma.usuario.create({
    data: {
      nombre: `Contabilidad ${base.tag}`,
      correo: `${base.tag}-conta@integration.test`,
      contrasena: 'integration-only',
      rol: 'CONTABILIDAD',
      activo: true,
      empresaId: base.empresa.id,
    },
  });

  await prisma.pedido.update({
    where: { id: base.pedido.id },
    data: {
      condicionPago: 'CREDITO',
      subtotal: 200,
      descuentoTotal: 20,
      total: 180,
      estado: 'ENTREGADO',
    },
  });

  await prisma.pedidoDetalle.update({
    where: { id: base.pedidoDetalle.id },
    data: {
      cantidadEntregada: 20,
      descuento: 20,
      subtotal: 180,
    },
  });

  const first = await createFinalDelivery(prisma, base, 0, 10, 'A');
  const second = await createFinalDelivery(prisma, base, 1, 10, 'B');

  return {
    base,
    contabilidad,
    entregas: [first, second] as const,
  };
}

async function createFinalDelivery(
  prisma: PrismaClient,
  base: TransportIntegrationFixture,
  dispatchIndex: number,
  quantity: number,
  suffix: string,
) {
  const dispatch = base.dispatches[dispatchIndex];

  return prisma.entrega.create({
    data: {
      ordenDespachoId: dispatch.orden.id,
      pedidoId: base.pedido.id,
      clienteId: base.cliente.id,
      registradoPorId: base.repartidor.id,
      estado: 'ENTREGADA',
      receptorNombre: `Cliente facturación ${suffix}`,
      latitud: 15.6666667,
      longitud: -91.7111111,
      iniciadaEn: new Date(Date.now() - 10 * 60_000),
      entregadoEn: new Date(Date.now() - 5 * 60_000),
      finalizadaEn: new Date(),
      claveIdempotencia: `${base.tag}:billing-delivery:${suffix}`,
      detalles: {
        create: {
          ordenDespachoDetalleId: dispatch.detalle.id,
          pedidoDetalleId: base.pedidoDetalle.id,
          productoId: base.producto.id,
          cantidadEntregada: quantity,
          cantidadRechazada: 0,
        },
      },
    },
    include: { detalles: true },
  });
}

export async function configureBillingFiscalProfiles(
  prisma: PrismaClient,
  fixture: BillingIntegrationFixture,
) {
  const { base } = fixture;

  const [company, customer, product] = await Promise.all([
    prisma.empresaPerfilFiscal.create({
      data: {
        empresaId: base.empresa.id,
        nit: `9${base.empresa.id}12345`,
        razonSocial: `Empresa Fiscal ${base.tag}`,
        afiliacionIva: 'GEN',
        correoFiscal: `${base.tag}-fel@integration.test`,
        direccion: 'Dirección fiscal integración',
        municipio: 'Jacaltenango',
        departamento: 'Huehuetenango',
        pais: 'GT',
        preciosIncluyenImpuestos: true,
        tasaIvaDefault: 12,
      },
    }),
    prisma.clientePerfilFiscal.create({
      data: {
        clienteId: base.cliente.id,
        tipoIdentificacion: 'NIT',
        identificacion: `8${base.cliente.id}12345`,
        nombreFiscal: `Cliente Fiscal ${base.tag}`,
        correoFiscal: `${base.tag}-cliente@integration.test`,
        direccion: 'Dirección fiscal cliente',
        municipio: 'Jacaltenango',
        departamento: 'Huehuetenango',
        pais: 'GT',
      },
    }),
    prisma.productoPerfilFiscal.create({
      data: {
        productoId: base.producto.id,
        bienOServicio: 'BIEN',
        unidadMedida: 'UN',
        descripcionFiscal: `Producto Fiscal ${base.tag}`,
        nombreCortoImpuesto: 'IVA',
        codigoUnidadGravable: 1,
        activo: true,
      },
    }),
  ]);

  const establishment = await prisma.establecimientoFiscal.create({
    data: {
      empresaId: base.empresa.id,
      codigoSat: 1,
      nombreComercial: `MARCAS ${base.tag}`,
      correo: `${base.tag}-establecimiento@integration.test`,
      direccion: 'Dirección establecimiento integración',
      municipio: 'Jacaltenango',
      departamento: 'Huehuetenango',
      pais: 'GT',
      esPrincipal: true,
      activo: true,
    },
  });

  return { company, customer, product, establishment };
}

export async function cleanupBillingIntegrationFixture(
  prisma: PrismaClient,
  fixture: BillingIntegrationFixture,
): Promise<void> {
  const empresaId = fixture.base.empresa.id;
  const clienteId = fixture.base.cliente.id;
  const productoId = fixture.base.producto.id;

  await prisma.documentoFiscal.deleteMany({ where: { empresaId } });
  await prisma.cuentaPorCobrar.deleteMany({ where: { empresaId } });
  await prisma.factura.deleteMany({ where: { empresaId } });
  await prisma.felContingencia.deleteMany({ where: { empresaId } });
  await prisma.dteSecuencia.deleteMany({ where: { empresaId } });
  await prisma.empresaProveedorFel.deleteMany({ where: { empresaId } });
  await prisma.establecimientoFiscal.deleteMany({ where: { empresaId } });
  await prisma.empresaPerfilFiscal.deleteMany({ where: { empresaId } });
  await prisma.clientePerfilFiscal.deleteMany({ where: { clienteId } });
  await prisma.productoPerfilFiscal.deleteMany({ where: { productoId } });
  await prisma.entrega.deleteMany({ where: { pedidoId: fixture.base.pedido.id } });

  await cleanupTransportIntegrationFixture(prisma, fixture.base);
}
