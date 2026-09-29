import { UpdateOrderUseCase } from './update-order.use-case';
import {
  FakeOrderActorDirectory,
  FakeOrderCustomerDirectory,
  FakeOrderProductCatalog,
  FakeOrderRepository,
  FakeOrderVisitDirectory,
  draftOrder,
  sellerActor,
} from '../../testing/order.fakes';

describe('UpdateOrderUseCase', () => {
  it('reemplaza líneas del borrador y recalcula totales', async () => {
    const repository = new FakeOrderRepository();
    const users = new FakeOrderActorDirectory();
    const customers = new FakeOrderCustomerDirectory();
    const visits = new FakeOrderVisitDirectory();
    const products = new FakeOrderProductCatalog();
    repository.entity = draftOrder();
    users.users.set(7, sellerActor(7));
    customers.ids.add(10);
    products.rows.set(200, { id: 200, codigo: 'P200', nombre: 'Nuevo', precio: '30.00' });
    const useCase = new UpdateOrderUseCase(repository, users, customers, visits, products);
    const order = await useCase.execute({
      id: 1,
      actorId: 7,
      detalles: [{ productoId: 200, cantidadSolicitada: 3, descuento: '0.00' }],
    });
    expect(order.total).toBe('90.00');
    expect(order.version).toBe(1);
    expect(repository.saveOptions?.replaceDetails).toBe(true);
    expect(repository.events[0].tipo).toBe('ACTUALIZADO');
  });
});
