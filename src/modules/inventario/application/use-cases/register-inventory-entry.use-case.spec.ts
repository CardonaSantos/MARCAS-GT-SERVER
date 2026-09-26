import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';
import { RegisterInventoryEntryUseCase } from './register-inventory-entry.use-case';
import {
  FakeBodegaDirectory,
  FakeProductCatalog,
  InMemoryInventoryRepository,
} from '../../testing/inventory.fakes';

describe('RegisterInventoryEntryUseCase', () => {
  it('registra una entrada, calcula costo y crea movimiento auditable', async () => {
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

    const coordinator = new InventoryMutationCoordinator(
      repository,
      bodegas,
      products,
    );
    const useCase = new RegisterInventoryEntryUseCase(coordinator);

    const result = await useCase.execute({
      bodegaId: 1,
      productoId: 10,
      cantidad: 10,
      costoUnitario: '25.5000',
      actorId: 3,
      claveIdempotencia: 'TEST:ENTRADA:1',
    });

    expect(result.repeated).toBe(false);
    expect(result.snapshot).toEqual({
      cantidadReal: 10,
      cantidadReservada: 0,
      cantidadDisponible: 10,
      costoPromedio: '25.5000',
    });
    expect(repository.movements.size).toBe(1);
    expect([...repository.movements.values()][0].tipo).toBe(
      'ENTRADA_RECEPCION',
    );
  });

  it('responde idempotentemente sin duplicar inventario', async () => {
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

    const useCase = new RegisterInventoryEntryUseCase(
      new InventoryMutationCoordinator(repository, bodegas, products),
    );

    const command = {
      bodegaId: 1,
      productoId: 10,
      cantidad: 10,
      costoUnitario: '25.5000',
      actorId: 3,
      claveIdempotencia: 'TEST:ENTRADA:IDEMPOTENTE',
    } as const;

    await useCase.execute(command);
    const repeated = await useCase.execute(command);

    expect(repeated.repeated).toBe(true);
    expect(repeated.snapshot.cantidadReal).toBe(10);
    expect(repository.movements.size).toBe(1);
  });
});
