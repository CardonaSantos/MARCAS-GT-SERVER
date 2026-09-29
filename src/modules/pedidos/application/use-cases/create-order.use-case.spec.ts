import { CreateOrderUseCase } from './create-order.use-case';
import {
  FakeOrderActorDirectory,
  FakeOrderCustomerDirectory,
  FakeOrderProductCatalog,
  FakeOrderRepository,
  FakeOrderVisitDirectory,
  sellerActor,
} from '../../testing/order.fakes';

describe('CreateOrderUseCase', () => {
  it('crea el borrador usando precio del catálogo y empresa del actor', async () => {
    const repository = new FakeOrderRepository();
    const users = new FakeOrderActorDirectory();
    const customers = new FakeOrderCustomerDirectory();
    const visits = new FakeOrderVisitDirectory();
    const products = new FakeOrderProductCatalog();
    users.users.set(7, sellerActor(7));
    customers.ids.add(10);
    products.rows.set(100, { id: 100, codigo: 'P100', nombre: 'Producto', precio: '50.00' });
    const useCase = new CreateOrderUseCase(repository, users, customers, visits, products);
    const order = await useCase.execute({
      clienteId: 10,
      condicionPago: 'PREPAGO',
      actorId: 7,
      detalles: [{ productoId: 100, cantidadSolicitada: 2, descuento: '10.00' }],
    });
    expect(order.empresaId).toBe(1);
    expect(order.vendedorId).toBe(7);
    expect(order.total).toBe('90.00');
    expect(repository.events[0].tipo).toBe('CREADO');
  });
});
