import { PrismaClient } from '@prisma/client';

let counter = 0;

export type DispatchE2EFixture = Awaited<
  ReturnType<typeof createDispatchE2EFixture>
>;

export async function createDispatchE2EFixture(
  prisma: PrismaClient,
) {
  const suffix = `${process.pid}-${Date.now()}-${++counter}`;

  const empresa = await prisma.empresa.create({
    data: {
      nombre: `E2E Empresa ${suffix}`,
      telefono: '55550000',
      direccion: 'E2E Despachos',
      email: `e2e-empresa-${suffix}@test.local`,
    },
  });

  const createUser = (
    role:
      | 'ADMIN'
      | 'BODEGA'
      | 'VENDEDOR'
      | 'CONTABILIDAD'
      | 'REPARTIDOR',
    tag: string,
  ) =>
    prisma.usuario.create({
      data: {
        nombre: `E2E ${tag} ${suffix}`,
        correo: `e2e-${tag.toLowerCase()}-${suffix}@test.local`,
        contrasena: 'e2e-only',
        rol: role,
        activo: true,
        empresaId: empresa.id,
      },
    });

  const [
    admin,
    bodegaUser,
    vendedor,
    vendedorOtro,
    contabilidad,
    repartidor,
  ] = await Promise.all([
    createUser('ADMIN', 'Admin'),
    createUser('BODEGA', 'Bodega'),
    createUser('VENDEDOR', 'Vendedor'),
    createUser('VENDEDOR', 'VendedorOtro'),
    createUser('CONTABILIDAD', 'Contabilidad'),
    createUser('REPARTIDOR', 'Repartidor'),
  ]);

  const bodega = await prisma.bodega.create({
    data: {
      empresaId: empresa.id,
      codigo: `E2E-BOD-${suffix}`,
      nombre: `E2E Bodega ${suffix}`,
      activo: true,
      esPrincipal: true,
      responsableId: bodegaUser.id,
    },
  });

  const cliente = await prisma.cliente.create({
    data: {
      nombre: 'Cliente',
      apellido: `E2E ${suffix}`,
      correo: `e2e-cliente-${suffix}@test.local`,
      telefono: '55551111',
      direccion: 'Dirección E2E',
      categoriasInteres: [],
    },
  });

  const producto = await prisma.producto.create({
    data: {
      nombre: `E2E Producto ${suffix}`,
      descripcion: 'Producto exclusivo para E2E Despachos',
      precio: 100,
      costo: 50,
      codigoProducto: `E2E-PRD-${suffix}`,
    },
  });

  const createOrder = async (
    tag: string,
    cantidad: number,
    vendedorId = vendedor.id,
  ) =>
    prisma.pedido.create({
      data: {
        numero: `E2E-PED-${tag}-${suffix}`,
        empresaId: empresa.id,
        clienteId: cliente.id,
        vendedorId,
        estado: 'CONFIRMADO',
        condicionPago: 'CONTRAENTREGA',
        estadoPago: 'PENDIENTE',
        moneda: 'GTQ',
        subtotal: String(cantidad * 100),
        descuentoTotal: '0.00',
        total: String(cantidad * 100),
        confirmadoEn: new Date(),
        detalles: {
          create: {
            productoId: producto.id,
            cantidadSolicitada: cantidad,
            cantidadReservada: 0,
            cantidadDespachada: 0,
            cantidadEntregada: 0,
            precioUnitario: '100.00',
            descuento: '0.00',
            subtotal: String(cantidad * 100),
          },
        },
      },
      include: { detalles: true },
    });

  const pedidoPrincipal = await createOrder('MAIN', 10);
  const pedidoRetry = await createOrder('RETRY', 2);
  const pedidoOtroVendedor = await createOrder(
    'OTHER',
    1,
    vendedorOtro.id,
  );

  const stock = await prisma.stockBodega.create({
    data: {
      bodegaId: bodega.id,
      productoId: producto.id,
      cantidadReal: 10,
      cantidadReservada: 0,
      cantidadDisponible: 10,
      costoPromedio: '50.0000',
    },
  });

  return {
    suffix,
    empresa,
    admin,
    bodegaUser,
    vendedor,
    vendedorOtro,
    contabilidad,
    repartidor,
    bodega,
    cliente,
    producto,
    stock,
    pedidoPrincipal,
    pedidoPrincipalDetalle: pedidoPrincipal.detalles[0],
    pedidoRetry,
    pedidoRetryDetalle: pedidoRetry.detalles[0],
    pedidoOtroVendedor,
    pedidoOtroVendedorDetalle: pedidoOtroVendedor.detalles[0],
  };
}

export async function cleanupDispatchE2EFixture(
  prisma: PrismaClient,
  fixture: DispatchE2EFixture,
) {
  const pedidos = await prisma.pedido.findMany({
    where: { empresaId: fixture.empresa.id },
    select: { id: true },
  });
  const pedidoIds = pedidos.map((x) => x.id);

  const pedidoDetalles = pedidoIds.length
    ? await prisma.pedidoDetalle.findMany({
        where: { pedidoId: { in: pedidoIds } },
        select: { id: true },
      })
    : [];
  const pedidoDetalleIds = pedidoDetalles.map((x) => x.id);

  const dispatches = pedidoIds.length
    ? await prisma.ordenDespacho.findMany({
        where: { pedidoId: { in: pedidoIds } },
        select: { id: true },
      })
    : [];
  const dispatchIds = dispatches.map((x) => x.id);

  if (dispatchIds.length) {
    const operations = await prisma.operacionDespacho.findMany({
      where: { ordenDespachoId: { in: dispatchIds } },
      select: { id: true },
    });
    const operationIds = operations.map((x) => x.id);

    if (operationIds.length) {
      await prisma.operacionDespachoDetalle.deleteMany({
        where: { operacionId: { in: operationIds } },
      });
      await prisma.operacionDespacho.deleteMany({
        where: { id: { in: operationIds } },
      });
    }

    const entregas = await prisma.entrega.findMany({
      where: { ordenDespachoId: { in: dispatchIds } },
      select: { id: true },
    });
    const entregaIds = entregas.map((x) => x.id);

    if (entregaIds.length) {
      await prisma.entregaEvidencia.deleteMany({
        where: { entregaId: { in: entregaIds } },
      });
      await prisma.entregaDetalle.deleteMany({
        where: { entregaId: { in: entregaIds } },
      });
      await prisma.entrega.deleteMany({
        where: { id: { in: entregaIds } },
      });
    }

    await prisma.envioDespacho.deleteMany({
      where: { ordenDespachoId: { in: dispatchIds } },
    });

    await prisma.ordenDespachoEvento.deleteMany({
      where: { ordenDespachoId: { in: dispatchIds } },
    });

    await prisma.ordenDespachoDetalle.deleteMany({
      where: { ordenDespachoId: { in: dispatchIds } },
    });

    await prisma.ordenDespacho.deleteMany({
      where: { id: { in: dispatchIds } },
    });
  }

  if (pedidoDetalleIds.length) {
    const reservations = await prisma.reservaInventario.findMany({
      where: { pedidoDetalleId: { in: pedidoDetalleIds } },
      select: { id: true },
    });
    const reservationIds = reservations.map((x) => x.id);

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
  }

  await prisma.stockBodega.deleteMany({
    where: {
      bodegaId: fixture.bodega.id,
      productoId: fixture.producto.id,
    },
  });

  if (pedidoIds.length) {
    await prisma.pedidoEvento.deleteMany({
      where: { pedidoId: { in: pedidoIds } },
    });

    await prisma.pedidoDetalle.deleteMany({
      where: { pedidoId: { in: pedidoIds } },
    });

    await prisma.pedido.deleteMany({
      where: { id: { in: pedidoIds } },
    });
  }

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
        in: [
          fixture.admin.id,
          fixture.bodegaUser.id,
          fixture.vendedor.id,
          fixture.vendedorOtro.id,
          fixture.contabilidad.id,
          fixture.repartidor.id,
        ],
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
