import { InventoryCost } from '../../domain/value-objects/inventory-cost.vo';
import { StockBodega } from '../../domain/entities/stock-bodega.entity';
import { InventoryOrderNotReservableError } from '../../domain/errors/inventory.errors';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';
import { ReserveInventoryUseCase } from './reserve-inventory.use-case';
import { ReleaseInventoryReservationUseCase } from './release-inventory-reservation.use-case';
import { CancelInventoryReservationUseCase } from './cancel-inventory-reservation.use-case';
import {
  FakeBodegaDirectory,
  FakeProductCatalog,
  InMemoryInventoryRepository,
} from '../../testing/inventory.fakes';

function setup(orderState: 'BORRADOR' | 'CONFIRMADO' = 'CONFIRMADO') {
  const repository = new InMemoryInventoryRepository();
  const bodegas = new FakeBodegaDirectory();
  const products = new FakeProductCatalog();

  bodegas.add({
    id: 1,
    codigo: 'CENTRAL',
    nombre: 'Bodega Central',
    activo: true,
    esPrincipal: true,
  });
  products.add({ id: 10, codigo: 'PROD-10', nombre: 'Producto 10' });

  const stock = StockBodega.create(1, 10);
  stock.registerEntry(20, InventoryCost.from('30.0000'));
  repository.seedStock(stock);
  repository.seedOrderDetail({
    id: 50,
    pedidoId: 100,
    pedidoEstado: orderState,
    productoId: 10,
    cantidadSolicitada: 12,
    cantidadReservada: 0,
    cantidadDespachada: 0,
  });

  const coordinator = new InventoryMutationCoordinator(
    repository,
    bodegas,
    products,
  );

  return {
    repository,
    bodegas,
    products,
    coordinator,
    reserve: new ReserveInventoryUseCase(
      repository,
      bodegas,
      products,
      coordinator,
    ),
    release: new ReleaseInventoryReservationUseCase(
      repository,
      coordinator,
    ),
    cancel: new CancelInventoryReservationUseCase(
      repository,
      coordinator,
    ),
  };
}

describe('ReserveInventoryUseCase', () => {
  it('reserva stock, sincroniza el detalle y audita el pedido', async () => {
    const { repository, reserve } = setup();

    const result = await reserve.execute({
      pedidoDetalleId: 50,
      bodegaId: 1,
      cantidad: 7,
      actorId: 3,
      claveIdempotencia: 'TEST:RESERVA:50:1',
    });

    expect(result.reservaId).toBeDefined();
    expect(result.snapshot).toEqual({
      cantidadReal: 20,
      cantidadReservada: 7,
      cantidadDisponible: 13,
      costoPromedio: '30.0000',
    });
    expect(repository.orderDetails.get(50)?.cantidadReservada).toBe(7);

    const reservation = [...repository.reservations.values()][0];
    expect(reservation.cantidadOriginal).toBe(7);
    expect(reservation.cantidadPendiente).toBe(7);
    expect(reservation.estado).toBe('ACTIVA');

    expect(repository.orderEvents).toEqual([
      expect.objectContaining({
        pedidoId: 100,
        actorId: 3,
        tipo: 'RESERVA_CREADA',
        referencia: {
          type: 'RESERVA_INVENTARIO',
          id: result.reservaId,
        },
      }),
    ]);
  });

  it('mantiene idempotencia sin duplicar el evento de pedido', async () => {
    const { repository, reserve } = setup();

    const command = {
      pedidoDetalleId: 50,
      bodegaId: 1,
      cantidad: 7,
      actorId: 3,
      claveIdempotencia: 'TEST:RESERVA:IDEMPOTENTE',
    };

    const first = await reserve.execute(command);
    const repeated = await reserve.execute(command);

    expect(first.repeated).toBe(false);
    expect(repeated.repeated).toBe(true);
    expect(repository.orderDetails.get(50)?.cantidadReservada).toBe(7);
    expect(repository.reservations.size).toBe(1);
    expect(repository.movements.size).toBe(1);
    expect(repository.orderEvents).toHaveLength(1);
    expect(repository.orderEvents[0]?.tipo).toBe('RESERVA_CREADA');
  });

  it('rechaza reservas para pedidos que todavía están en borrador', async () => {
    const { repository, reserve } = setup('BORRADOR');

    await expect(
      reserve.execute({
        pedidoDetalleId: 50,
        bodegaId: 1,
        cantidad: 7,
        actorId: 3,
        claveIdempotencia: 'TEST:RESERVA:BORRADOR',
      }),
    ).rejects.toBeInstanceOf(InventoryOrderNotReservableError);

    expect(repository.orderDetails.get(50)?.cantidadReservada).toBe(0);
    expect(repository.reservations.size).toBe(0);
    expect(repository.movements.size).toBe(0);
    expect(repository.orderEvents).toHaveLength(0);
  });

  it('audita liberaciones parciales y cancelación de la reserva', async () => {
    const { repository, reserve, release, cancel } = setup();

    const reserved = await reserve.execute({
      pedidoDetalleId: 50,
      bodegaId: 1,
      cantidad: 7,
      actorId: 3,
      claveIdempotencia: 'TEST:RESERVA:LIBERACION',
    });

    await release.execute({
      reservaId: reserved.reservaId!,
      cantidad: 2,
      actorId: 4,
      claveIdempotencia: 'TEST:LIBERACION:PARCIAL',
    });

    await cancel.execute({
      reservaId: reserved.reservaId!,
      motivo: 'Pedido cancelado por el cliente.',
      actorId: 5,
      claveIdempotencia: 'TEST:LIBERACION:CANCELACION',
    });

    expect(repository.orderDetails.get(50)?.cantidadReservada).toBe(0);
    expect(repository.orderEvents.map((event) => event.tipo)).toEqual([
      'RESERVA_CREADA',
      'RESERVA_LIBERADA',
      'RESERVA_LIBERADA',
    ]);
    expect(repository.orderEvents[1]).toEqual(
      expect.objectContaining({
        pedidoId: 100,
        actorId: 4,
        referencia: {
          type: 'RESERVA_INVENTARIO',
          id: reserved.reservaId,
        },
      }),
    );
    expect(repository.orderEvents[2]?.detalle).toContain(
      'se liberaron 5 unidades',
    );
  });
});
