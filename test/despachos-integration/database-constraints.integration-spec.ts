import {
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  cleanupDispatchIntegrationFixture,
  createDispatchIntegrationFixture,
  DispatchIntegrationFixture,
} from './fixtures';
import { createIntegrationPrisma } from './integration-db';

describe('Despachos database constraints / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: DispatchIntegrationFixture;
  let dispatchId: number;
  let dispatchDetailId: number;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();

    fixture = await createDispatchIntegrationFixture(prisma);

    const dispatch = await prisma.ordenDespacho.create({
      data: {
        pedidoId: fixture.pedido.id,
        bodegaId: fixture.bodega.id,
        creadoPorId: fixture.admin.id,
        estado: 'PENDIENTE',
        detalles: {
          create: {
            pedidoDetalleId: fixture.pedidoDetalle.id,
            productoId: fixture.producto.id,
            cantidadProgramada: 10,
            cantidadPreparada: 0,
            cantidadDespachada: 0,
          },
        },
      },
      include: { detalles: true },
    });

    dispatchId = dispatch.id;
    dispatchDetailId = dispatch.detalles[0].id;
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupDispatchIntegrationFixture(prisma, fixture);
    }
    await prisma.$disconnect();
  });

  it('CHECK rechaza intentos negativos en OperacionDespacho', async () => {
    await expect(
      prisma.operacionDespacho.create({
        data: {
          ordenDespachoId: dispatchId,
          usuarioId: fixture.admin.id,
          tipo: 'RESERVA_PREPARACION',
          estado: 'PENDIENTE',
          claveIdempotencia: `IT-CHECK-NEG-${fixture.suffix}`,
          intentos: -1,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('CHECK rechaza cantidad 0 en OperacionDespachoDetalle', async () => {
    const operation = await prisma.operacionDespacho.create({
      data: {
        ordenDespachoId: dispatchId,
        usuarioId: fixture.admin.id,
        tipo: 'RESERVA_PREPARACION',
        estado: 'PENDIENTE',
        claveIdempotencia: `IT-CHECK-QTY-${fixture.suffix}`,
      },
    });

    await expect(
      prisma.operacionDespachoDetalle.create({
        data: {
          operacionId: operation.id,
          ordenDespachoDetalleId: dispatchDetailId,
          cantidad: 0,
          estado: 'PENDIENTE',
          claveIdempotencia: `IT-CHECK-QTY-DET-${fixture.suffix}`,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('CHECK rechaza detalle APLICADA sin reserva/movimiento/aplicadaEn', async () => {
    const operation = await prisma.operacionDespacho.create({
      data: {
        ordenDespachoId: dispatchId,
        usuarioId: fixture.admin.id,
        tipo: 'SALIDA_DESPACHO',
        estado: 'PENDIENTE',
        claveIdempotencia: `IT-CHECK-APPLIED-${fixture.suffix}`,
      },
    });

    await expect(
      prisma.operacionDespachoDetalle.create({
        data: {
          operacionId: operation.id,
          ordenDespachoDetalleId: dispatchDetailId,
          cantidad: 1,
          estado: 'APLICADA',
          claveIdempotencia: `IT-CHECK-APPLIED-DET-${fixture.suffix}`,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('UNIQUE rechaza claveIdempotencia duplicada en OperacionDespacho', async () => {
    const key = `IT-UNIQUE-OP-${fixture.suffix}`;

    await prisma.operacionDespacho.create({
      data: {
        ordenDespachoId: dispatchId,
        usuarioId: fixture.admin.id,
        tipo: 'RESERVA_PREPARACION',
        estado: 'PENDIENTE',
        claveIdempotencia: key,
      },
    });

    await expect(
      prisma.operacionDespacho.create({
        data: {
          ordenDespachoId: dispatchId,
          usuarioId: fixture.admin.id,
          tipo: 'RESERVA_PREPARACION',
          estado: 'PENDIENTE',
          claveIdempotencia: key,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('UNIQUE rechaza movimientoInventarioId repetido entre líneas', async () => {
    const firstOperation = await prisma.operacionDespacho.create({
      data: {
        ordenDespachoId: dispatchId,
        usuarioId: fixture.admin.id,
        tipo: 'SALIDA_DESPACHO',
        estado: 'PENDIENTE',
        claveIdempotencia: `IT-UNIQUE-MOV-A-${fixture.suffix}`,
      },
    });

    const firstLine =
      await prisma.operacionDespachoDetalle.create({
        data: {
          operacionId: firstOperation.id,
          ordenDespachoDetalleId: dispatchDetailId,
          cantidad: 1,
          estado: 'PENDIENTE',
          reservaInventarioId: 900001,
          movimientoInventarioId: 990001,
          claveIdempotencia: `IT-UNIQUE-MOV-A-DET-${fixture.suffix}`,
        },
      });

    expect(firstLine.movimientoInventarioId).toBe(990001);

    const secondOperation = await prisma.operacionDespacho.create({
      data: {
        ordenDespachoId: dispatchId,
        usuarioId: fixture.admin.id,
        tipo: 'SALIDA_DESPACHO',
        estado: 'PENDIENTE',
        claveIdempotencia: `IT-UNIQUE-MOV-B-${fixture.suffix}`,
      },
    });

    await expect(
      prisma.operacionDespachoDetalle.create({
        data: {
          operacionId: secondOperation.id,
          ordenDespachoDetalleId: dispatchDetailId,
          cantidad: 1,
          estado: 'PENDIENTE',
          reservaInventarioId: 900002,
          movimientoInventarioId: 990001,
          claveIdempotencia: `IT-UNIQUE-MOV-B-DET-${fixture.suffix}`,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});
