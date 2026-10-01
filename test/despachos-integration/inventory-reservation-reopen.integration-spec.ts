import { PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { BodegaDirectoryPort } from 'src/modules/bodegas/application/ports/bodega-directory.port';
import { ApplyInventoryReservationUseCase } from 'src/modules/inventario/application/use-cases/apply-inventory-reservation.use-case';
import { InventoryMutationCoordinator } from 'src/modules/inventario/application/use-cases/inventory-mutation.coordinator';
import { ReserveInventoryUseCase } from 'src/modules/inventario/application/use-cases/reserve-inventory.use-case';
import { ProductCatalogPort } from 'src/modules/inventario/domain/ports/product-catalog.port';
import { InventoryPrismaRepository } from 'src/modules/inventario/infrastructure/persistence/prisma/inventory.prisma-repository';
import {
  cleanupDispatchIntegrationFixture,
  createDispatchIntegrationFixture,
  DispatchIntegrationFixture,
} from './fixtures';
import { createIntegrationPrisma } from './integration-db';

describe('ReservaInventario reopen / PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: DispatchIntegrationFixture;
  let reserve: ReserveInventoryUseCase;
  let apply: ApplyInventoryReservationUseCase;

  beforeAll(async () => {
    prisma = createIntegrationPrisma();
    await prisma.$connect();

    fixture = await createDispatchIntegrationFixture(prisma);

    await prisma.stockBodega.create({
      data: {
        bodegaId: fixture.bodega.id,
        productoId: fixture.producto.id,
        cantidadReal: 10,
        cantidadReservada: 0,
        cantidadDisponible: 10,
        costoPromedio: '50.0000',
      },
    });

    const repository = new InventoryPrismaRepository(
      prisma as unknown as PrismaService,
    );

    const bodegas: BodegaDirectoryPort = {
      findById: async (id) =>
        id === fixture.bodega.id
          ? {
              id: fixture.bodega.id,
              empresaId: fixture.empresa.id,
              codigo: fixture.bodega.codigo,
              nombre: fixture.bodega.nombre,
              activo: true,
              esPrincipal: true,
            }
          : null,
      findPrincipal: async () => ({
        id: fixture.bodega.id,
        empresaId: fixture.empresa.id,
        codigo: fixture.bodega.codigo,
        nombre: fixture.bodega.nombre,
        activo: true,
        esPrincipal: true,
      }),
    };

    const products: ProductCatalogPort = {
      findById: async (id) =>
        id === fixture.producto.id
          ? ({
              id: fixture.producto.id,
              codigo: fixture.producto.codigoProducto,
              nombre: fixture.producto.nombre,
              activo: true,
            } as any)
          : null,
    };

    const coordinator = new InventoryMutationCoordinator(
      repository,
      bodegas,
      products,
    );

    reserve = new ReserveInventoryUseCase(
      repository,
      bodegas,
      products,
      coordinator,
    );

    apply = new ApplyInventoryReservationUseCase(
      repository,
      coordinator,
    );
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupDispatchIntegrationFixture(prisma, fixture);
    }
    await prisma.$disconnect();
  });

  it('reserva 5, aplica 5 y reabre la misma reserva al reservar 3 adicionales', async () => {
    const first = await reserve.execute({
      pedidoDetalleId: fixture.pedidoDetalle.id,
      bodegaId: fixture.bodega.id,
      cantidad: 5,
      claveIdempotencia: `IT-RESERVE-A-${fixture.suffix}`,
      actorId: fixture.admin.id,
    });

    expect(first.repeated).toBe(false);
    expect(first.reservaId).toBeGreaterThan(0);

    let reservation =
      await prisma.reservaInventario.findUniqueOrThrow({
        where: { id: first.reservaId! },
      });

    expect(reservation).toEqual(
      expect.objectContaining({
        cantidadOriginal: 5,
        cantidadPendiente: 5,
        cantidadAplicada: 0,
        cantidadLiberada: 0,
        estado: 'ACTIVA',
      }),
    );

    const applied = await apply.execute({
      reservaId: first.reservaId!,
      cantidad: 5,
      reference: {
        type: 'OPERACION_DESPACHO_DETALLE',
        id: 700001,
      },
      claveIdempotencia: `IT-APPLY-A-${fixture.suffix}`,
      actorId: fixture.admin.id,
    });

    expect(applied.repeated).toBe(false);

    reservation =
      await prisma.reservaInventario.findUniqueOrThrow({
        where: { id: first.reservaId! },
      });

    expect(reservation.cantidadPendiente).toBe(0);
    expect(reservation.cantidadAplicada).toBe(5);
    expect(reservation.estado).toBe('APLICADA');
    expect(reservation.cerradaEn).not.toBeNull();

    const reopened = await reserve.execute({
      pedidoDetalleId: fixture.pedidoDetalle.id,
      bodegaId: fixture.bodega.id,
      cantidad: 3,
      claveIdempotencia: `IT-RESERVE-B-${fixture.suffix}`,
      actorId: fixture.admin.id,
    });

    expect(reopened.reservaId).toBe(first.reservaId);

    reservation =
      await prisma.reservaInventario.findUniqueOrThrow({
        where: { id: first.reservaId! },
      });

    expect(reservation).toEqual(
      expect.objectContaining({
        cantidadOriginal: 8,
        cantidadPendiente: 3,
        cantidadAplicada: 5,
        cantidadLiberada: 0,
        estado: 'PARCIAL',
      }),
    );
    expect(reservation.cerradaEn).toBeNull();
    expect(reservation.aplicadaEn).toBeNull();

    const stock = await prisma.stockBodega.findUniqueOrThrow({
      where: {
        bodegaId_productoId: {
          bodegaId: fixture.bodega.id,
          productoId: fixture.producto.id,
        },
      },
    });

    expect(stock).toEqual(
      expect.objectContaining({
        cantidadReal: 5,
        cantidadReservada: 3,
        cantidadDisponible: 2,
      }),
    );

    const detail = await prisma.pedidoDetalle.findUniqueOrThrow({
      where: { id: fixture.pedidoDetalle.id },
    });

    expect(detail.cantidadReservada).toBe(3);
    expect(detail.cantidadDespachada).toBe(0);
  });

  it('un retry con la misma clave no duplica stock, reserva ni movimiento', async () => {
    const before = await prisma.stockBodega.findUniqueOrThrow({
      where: {
        bodegaId_productoId: {
          bodegaId: fixture.bodega.id,
          productoId: fixture.producto.id,
        },
      },
    });

    const reservationBefore =
      await prisma.reservaInventario.findFirstOrThrow({
        where: {
          pedidoDetalleId: fixture.pedidoDetalle.id,
          stockBodegaId: before.id,
        },
      });

    const movementCountBefore =
      await prisma.movimientoInventario.count({
        where: {
          claveIdempotencia: `IT-RESERVE-B-${fixture.suffix}`,
        },
      });

    const repeated = await reserve.execute({
      pedidoDetalleId: fixture.pedidoDetalle.id,
      bodegaId: fixture.bodega.id,
      cantidad: 3,
      claveIdempotencia: `IT-RESERVE-B-${fixture.suffix}`,
      actorId: fixture.admin.id,
    });

    expect(repeated.repeated).toBe(true);
    expect(repeated.reservaId).toBe(reservationBefore.id);

    const after = await prisma.stockBodega.findUniqueOrThrow({
      where: { id: before.id },
    });

    const reservationAfter =
      await prisma.reservaInventario.findUniqueOrThrow({
        where: { id: reservationBefore.id },
      });

    expect(after.cantidadReal).toBe(before.cantidadReal);
    expect(after.cantidadReservada).toBe(
      before.cantidadReservada,
    );
    expect(after.cantidadDisponible).toBe(
      before.cantidadDisponible,
    );

    expect(reservationAfter.cantidadOriginal).toBe(
      reservationBefore.cantidadOriginal,
    );
    expect(reservationAfter.cantidadPendiente).toBe(
      reservationBefore.cantidadPendiente,
    );

    expect(
      await prisma.movimientoInventario.count({
        where: {
          claveIdempotencia: `IT-RESERVE-B-${fixture.suffix}`,
        },
      }),
    ).toBe(movementCountBefore);
  });

  it('puede aplicar la reserva reabierta y cerrarla nuevamente', async () => {
    const reservation =
      await prisma.reservaInventario.findFirstOrThrow({
        where: { pedidoDetalleId: fixture.pedidoDetalle.id },
      });

    await apply.execute({
      reservaId: reservation.id,
      cantidad: 3,
      reference: {
        type: 'OPERACION_DESPACHO_DETALLE',
        id: 700002,
      },
      claveIdempotencia: `IT-APPLY-B-${fixture.suffix}`,
      actorId: fixture.admin.id,
    });

    const closed =
      await prisma.reservaInventario.findUniqueOrThrow({
        where: { id: reservation.id },
      });

    expect(closed.cantidadOriginal).toBe(8);
    expect(closed.cantidadAplicada).toBe(8);
    expect(closed.cantidadPendiente).toBe(0);
    expect(closed.estado).toBe('APLICADA');
    expect(closed.cerradaEn).not.toBeNull();

    const stock = await prisma.stockBodega.findUniqueOrThrow({
      where: { id: reservation.stockBodegaId },
    });

    expect(stock.cantidadReal).toBe(2);
    expect(stock.cantidadReservada).toBe(0);
    expect(stock.cantidadDisponible).toBe(2);
  });
});
