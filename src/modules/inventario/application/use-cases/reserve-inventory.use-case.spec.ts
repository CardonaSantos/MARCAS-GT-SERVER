import { InventoryCost } from '../../domain/value-objects/inventory-cost.vo';
import { StockBodega } from '../../domain/entities/stock-bodega.entity';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';
import { ReserveInventoryUseCase } from './reserve-inventory.use-case';
import {
  FakeBodegaDirectory,
  FakeProductCatalog,
  InMemoryInventoryRepository,
} from '../../testing/inventory.fakes';

describe('ReserveInventoryUseCase', () => {
  it('reserva stock y sincroniza cantidadReservada del detalle de pedido', async () => {
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
    const useCase = new ReserveInventoryUseCase(
      repository,
      bodegas,
      products,
      coordinator,
    );

    const result = await useCase.execute({
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
  });
});
