import { PrismaClient } from '@prisma/client';

let counter = 0;

export type DispatchIntegrationFixture = Awaited<
  ReturnType<typeof createDispatchIntegrationFixture>
>;

export async function createDispatchIntegrationFixture(
  prisma: PrismaClient,
) {
  const suffix = `${process.pid}-${Date.now()}-${++counter}`;

  const empresa = await prisma.empresa.create({
    data: {
      nombre: `IT Empresa ${suffix}`,
      telefono: '55550000',
      direccion: 'Integración Despachos',
      email: `it-empresa-${suffix}@test.local`,
    },
  });

  const admin = await prisma.usuario.create({
    data: {
      nombre: `IT Admin ${suffix}`,
      correo: `it-admin-${suffix}@test.local`,
      contrasena: 'integration-only',
      rol: 'ADMIN',
      activo: true,
      empresaId: empresa.id,
    },
  });

  const vendedor = await prisma.usuario.create({
    data: {
      nombre: `IT Vendedor ${suffix}`,
      correo: `it-vendedor-${suffix}@test.local`,
      contrasena: 'integration-only',
      rol: 'VENDEDOR',
      activo: true,
      empresaId: empresa.id,
    },
  });

  const bodega = await prisma.bodega.create({
    data: {
      empresaId: empresa.id,
      codigo: `IT-BOD-${suffix}`,
      nombre: `IT Bodega ${suffix}`,
      activo: true,
      esPrincipal: true,
      responsableId: admin.id,
    },
  });

  const cliente = await prisma.cliente.create({
    data: {
      nombre: 'Cliente',
      apellido: `Integración ${suffix}`,
      correo: `it-cliente-${suffix}@test.local`,
      telefono: '55551111',
      direccion: 'Dirección integración',
      categoriasInteres: [],
    },
  });

  const producto = await prisma.producto.create({
    data: {
      nombre: `IT Producto ${suffix}`,
      descripcion: 'Producto exclusivo de la suite de integración',
      precio: 100,
      costo: 50,
      codigoProducto: `IT-PRD-${suffix}`,
    },
  });

  const pedido = await prisma.pedido.create({
    data: {
      numero: `IT-PED-${suffix}`,
      empresaId: empresa.id,
      clienteId: cliente.id,
      vendedorId: vendedor.id,
      estado: 'CONFIRMADO',
      condicionPago: 'CONTRAENTREGA',
      estadoPago: 'PENDIENTE',
      moneda: 'GTQ',
      subtotal: '1000.00',
      descuentoTotal: '0.00',
      total: '1000.00',
      confirmadoEn: new Date(),
      detalles: {
        create: {
          productoId: producto.id,
          cantidadSolicitada: 10,
          cantidadReservada: 0,
          cantidadDespachada: 0,
          cantidadEntregada: 0,
          precioUnitario: '100.00',
          descuento: '0.00',
          subtotal: '1000.00',
        },
      },
    },
    include: {
      detalles: true,
    },
  });

  return {
    suffix,
    empresa,
    admin,
    vendedor,
    bodega,
    cliente,
    producto,
    pedido,
    pedidoDetalle: pedido.detalles[0],
  };
}

export async function cleanupDispatchIntegrationFixture(
  prisma: PrismaClient,
  fixture: DispatchIntegrationFixture,
) {
  const dispatches = await prisma.ordenDespacho.findMany({
    where: { pedidoId: fixture.pedido.id },
    select: { id: true },
  });

  const dispatchIds = dispatches.map((row) => row.id);

  if (dispatchIds.length) {
    const operations = await prisma.operacionDespacho.findMany({
      where: { ordenDespachoId: { in: dispatchIds } },
      select: { id: true },
    });

    const operationIds = operations.map((row) => row.id);

    if (operationIds.length) {
      await prisma.operacionDespachoDetalle.deleteMany({
        where: { operacionId: { in: operationIds } },
      });
      await prisma.operacionDespacho.deleteMany({
        where: { id: { in: operationIds } },
      });
    }

    await prisma.ordenDespachoEvento.deleteMany({
      where: { ordenDespachoId: { in: dispatchIds } },
    });

    await prisma.envioDespacho.deleteMany({
      where: { ordenDespachoId: { in: dispatchIds } },
    });

    await prisma.entregaDetalle.deleteMany({
      where: {
        ordenDespachoDetalle: {
          is: { ordenDespachoId: { in: dispatchIds } },
        },
      },
    });

    await prisma.entrega.deleteMany({
      where: { ordenDespachoId: { in: dispatchIds } },
    });

    await prisma.ordenDespachoDetalle.deleteMany({
      where: { ordenDespachoId: { in: dispatchIds } },
    });

    await prisma.ordenDespacho.deleteMany({
      where: { id: { in: dispatchIds } },
    });
  }

  const reservations = await prisma.reservaInventario.findMany({
    where: { pedidoDetalleId: fixture.pedidoDetalle.id },
    select: { id: true, stockBodegaId: true },
  });

  const reservationIds = reservations.map((row) => row.id);
  const stockIds = reservations.map((row) => row.stockBodegaId);

  if (reservationIds.length) {
    await prisma.movimientoInventario.deleteMany({
      where: { reservaInventarioId: { in: reservationIds } },
    });

    await prisma.reservaInventario.deleteMany({
      where: { id: { in: reservationIds } },
    });
  }

  await prisma.movimientoInventario.deleteMany({
    where: {
      bodegaId: fixture.bodega.id,
      productoId: fixture.producto.id,
    },
  });

  if (stockIds.length) {
    await prisma.stockBodega.deleteMany({
      where: { id: { in: stockIds } },
    });
  }

  await prisma.stockBodega.deleteMany({
    where: {
      bodegaId: fixture.bodega.id,
      productoId: fixture.producto.id,
    },
  });

  await prisma.pedidoEvento.deleteMany({
    where: { pedidoId: fixture.pedido.id },
  });

  await prisma.pedidoDetalle.deleteMany({
    where: { pedidoId: fixture.pedido.id },
  });

  await prisma.pedido.deleteMany({
    where: { id: fixture.pedido.id },
  });

  await prisma.bodegaEvento.deleteMany({
    where: { bodegaId: fixture.bodega.id },
  });

  await prisma.bodega.deleteMany({
    where: { id: fixture.bodega.id },
  });

  await prisma.cliente.deleteMany({
    where: { id: fixture.cliente.id },
  });

  await prisma.usuario.deleteMany({
    where: {
      id: {
        in: [fixture.admin.id, fixture.vendedor.id],
      },
    },
  });

  await prisma.producto.deleteMany({
    where: { id: fixture.producto.id },
  });

  await prisma.empresa.deleteMany({
    where: { id: fixture.empresa.id },
  });
}
