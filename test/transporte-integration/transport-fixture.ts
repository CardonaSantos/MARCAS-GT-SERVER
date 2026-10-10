import { PrismaClient } from '@prisma/client';

export type TransportIntegrationFixture = Awaited<
  ReturnType<typeof createTransportIntegrationFixture>
>;

function uniqueTag(): string {
  return [
    'transport-int',
    Date.now(),
    Math.random().toString(36).slice(2, 10),
  ].join('-');
}

export async function createTransportIntegrationFixture(
  prisma: PrismaClient,
) {
  const tag = uniqueTag();

  const empresa = await prisma.empresa.create({
    data: {
      nombre: `Empresa ${tag}`,
      telefono: '55550000',
      direccion: 'Dirección integración Transporte',
      email: `${tag}@integration.test`,
    },
  });

  const admin = await prisma.usuario.create({
    data: {
      nombre: `Admin ${tag}`,
      correo: `${tag}-admin@integration.test`,
      contrasena: 'integration-only',
      rol: 'ADMIN',
      activo: true,
      empresaId: empresa.id,
    },
  });

  const bodegaUser = await prisma.usuario.create({
    data: {
      nombre: `Bodega ${tag}`,
      correo: `${tag}-bodega@integration.test`,
      contrasena: 'integration-only',
      rol: 'BODEGA',
      activo: true,
      empresaId: empresa.id,
    },
  });

  const vendedor = await prisma.usuario.create({
    data: {
      nombre: `Vendedor ${tag}`,
      correo: `${tag}-seller@integration.test`,
      contrasena: 'integration-only',
      rol: 'VENDEDOR',
      activo: true,
      empresaId: empresa.id,
    },
  });

  const otroVendedor = await prisma.usuario.create({
    data: {
      nombre: `Otro vendedor ${tag}`,
      correo: `${tag}-seller2@integration.test`,
      contrasena: 'integration-only',
      rol: 'VENDEDOR',
      activo: true,
      empresaId: empresa.id,
    },
  });

  const repartidor = await prisma.usuario.create({
    data: {
      nombre: `Repartidor ${tag}`,
      correo: `${tag}-driver-user@integration.test`,
      contrasena: 'integration-only',
      rol: 'REPARTIDOR',
      activo: true,
      empresaId: empresa.id,
    },
  });

  const bodega = await prisma.bodega.create({
    data: {
      empresaId: empresa.id,
      codigo: `BOD-${tag.slice(-20).toUpperCase()}`,
      nombre: `Bodega ${tag}`,
      direccion: 'Zona de integración',
      activo: true,
      esPrincipal: true,
    },
  });

  const cliente = await prisma.cliente.create({
    data: {
      nombre: 'Cliente',
      apellido: tag,
      telefono: '55551111',
      direccion: 'Dirección cliente integración',
      categoriasInteres: [],
    },
  });

  const producto = await prisma.producto.create({
    data: {
      nombre: `Producto ${tag}`,
      descripcion: 'Producto exclusivo para integración Transporte',
      precio: 10,
      costo: 5,
      codigoProducto: `PROD-${tag}`,
    },
  });

  const pedido = await prisma.pedido.create({
    data: {
      numero: `PED-${tag}`,
      empresaId: empresa.id,
      clienteId: cliente.id,
      vendedorId: vendedor.id,
      estado: 'CONFIRMADO',
      condicionPago: 'PREPAGO',
      estadoPago: 'PAGADO',
      moneda: 'GTQ',
      subtotal: 200,
      descuentoTotal: 0,
      total: 200,
    },
  });

  const pedidoDetalle = await prisma.pedidoDetalle.create({
    data: {
      pedidoId: pedido.id,
      productoId: producto.id,
      cantidadSolicitada: 20,
      // El pedido ya está totalmente despachado en las dos órdenes del fixture.
      // La reserva remanente debe ser 0 porque:
      // cantidadReservada + cantidadDespachada <= cantidadSolicitada.
      cantidadReservada: 0,
      cantidadDespachada: 20,
      cantidadEntregada: 0,
      precioUnitario: 10,
      descuento: 0,
      subtotal: 200,
    },
  });

  const ordenDespacho1 = await prisma.ordenDespacho.create({
    data: {
      pedidoId: pedido.id,
      bodegaId: bodega.id,
      numero: `DSP-A-${tag}`,
      estado: 'DESPACHADA',
      creadoPorId: admin.id,
      preparadoPorId: bodegaUser.id,
      despachadoPorId: bodegaUser.id,
      programadoEn: new Date(),
      preparacionIniciadaEn: new Date(),
      preparadoEn: new Date(),
      despachadoEn: new Date(),
    },
  });

  const ordenDespachoDetalle1 =
    await prisma.ordenDespachoDetalle.create({
      data: {
        ordenDespachoId: ordenDespacho1.id,
        pedidoDetalleId: pedidoDetalle.id,
        productoId: producto.id,
        cantidadProgramada: 10,
        cantidadPreparada: 10,
        cantidadDespachada: 10,
      },
    });

  const ordenDespacho2 = await prisma.ordenDespacho.create({
    data: {
      pedidoId: pedido.id,
      bodegaId: bodega.id,
      numero: `DSP-B-${tag}`,
      estado: 'DESPACHADA',
      creadoPorId: admin.id,
      preparadoPorId: bodegaUser.id,
      despachadoPorId: bodegaUser.id,
      programadoEn: new Date(),
      preparacionIniciadaEn: new Date(),
      preparadoEn: new Date(),
      despachadoEn: new Date(),
    },
  });

  const ordenDespachoDetalle2 =
    await prisma.ordenDespachoDetalle.create({
      data: {
        ordenDespachoId: ordenDespacho2.id,
        pedidoDetalleId: pedidoDetalle.id,
        productoId: producto.id,
        cantidadProgramada: 10,
        cantidadPreparada: 10,
        cantidadDespachada: 10,
      },
    });

  const transportistaExterno = await prisma.transportista.create({
    data: {
      empresaId: empresa.id,
      codigo: `EXT-${tag}`,
      tipo: 'EXTERNO',
      nombre: `Transportista ${tag}`,
      activo: true,
    },
  });

  const vehiculo = await prisma.vehiculo.create({
    data: {
      empresaId: empresa.id,
      placa: `P-${tag.slice(-10)}`,
      marca: 'Toyota',
      modelo: 'Integración',
      capacidadKg: 1000,
      estado: 'DISPONIBLE',
      activo: true,
    },
  });

  const conductor = await prisma.conductor.create({
    data: {
      empresaId: empresa.id,
      nombre: `Conductor ${tag}`,
      telefono: '55552222',
      licencia: `LIC-${tag}`,
      estado: 'DISPONIBLE',
      activo: true,
    },
  });

  return {
    tag,
    empresa,
    admin,
    bodegaUser,
    vendedor,
    otroVendedor,
    repartidor,
    bodega,
    cliente,
    producto,
    pedido,
    pedidoDetalle,
    transportistaExterno,
    vehiculo,
    conductor,
    dispatches: [
      {
        orden: ordenDespacho1,
        detalle: ordenDespachoDetalle1,
      },
      {
        orden: ordenDespacho2,
        detalle: ordenDespachoDetalle2,
      },
    ] as const,
  };
}

export async function cleanupTransportIntegrationFixture(
  prisma: PrismaClient,
  fixture: TransportIntegrationFixture,
): Promise<void> {
  await prisma.envio.deleteMany({
    where: {
      empresaId: fixture.empresa.id,
    },
  });

  await prisma.conductor.deleteMany({
    where: {
      empresaId: fixture.empresa.id,
    },
  });

  await prisma.vehiculo.deleteMany({
    where: {
      empresaId: fixture.empresa.id,
    },
  });

  await prisma.transportista.deleteMany({
    where: {
      empresaId: fixture.empresa.id,
    },
  });

  await prisma.ordenDespacho.deleteMany({
    where: {
      pedidoId: fixture.pedido.id,
    },
  });

  await prisma.pedido.deleteMany({
    where: {
      id: fixture.pedido.id,
    },
  });

  await prisma.producto.deleteMany({
    where: {
      id: fixture.producto.id,
    },
  });

  await prisma.cliente.deleteMany({
    where: {
      id: fixture.cliente.id,
    },
  });

  const fixtureUsers = await prisma.usuario.findMany({
    where: {
      empresaId: fixture.empresa.id,
    },
    select: {
      id: true,
    },
  });

  const fixtureUserIds = fixtureUsers.map((user) => user.id);

  if (fixtureUserIds.length) {
    const trackingSessions = await prisma.sesionTrackingUsuario.findMany({
      where: {
        usuarioId: {
          in: fixtureUserIds,
        },
      },
      select: {
        id: true,
      },
    });

    const trackingSessionIds = trackingSessions.map((session) => session.id);

    await prisma.ubicacionUsuarioActual.deleteMany({
      where: {
        usuarioId: {
          in: fixtureUserIds,
        },
      },
    });

    if (trackingSessionIds.length) {
      await prisma.ubicacionUsuarioHistorial.deleteMany({
        where: {
          sesionId: {
            in: trackingSessionIds,
          },
        },
      });
    }

    await prisma.sesionTrackingUsuario.deleteMany({
      where: {
        usuarioId: {
          in: fixtureUserIds,
        },
      },
    });
  }

  await prisma.bodega.deleteMany({
    where: {
      id: fixture.bodega.id,
    },
  });

  await prisma.usuario.deleteMany({
    where: {
      empresaId: fixture.empresa.id,
    },
  });

  await prisma.empresa.deleteMany({
    where: {
      id: fixture.empresa.id,
    },
  });
}
