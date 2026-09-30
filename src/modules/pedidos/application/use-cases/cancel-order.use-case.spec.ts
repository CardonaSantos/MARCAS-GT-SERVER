import { CancelOrderUseCase } from './cancel-order.use-case';
import { FakeOrderActorDirectory, FakeOrderRepository, draftOrder, sellerActor } from '../../testing/order.fakes';

describe('CancelOrderUseCase', () => {
  it('cancela un borrador con motivo y auditoría', async () => {
    const repository = new FakeOrderRepository();
    const users = new FakeOrderActorDirectory();
    repository.entity = draftOrder();
    users.users.set(7, sellerActor(7));
    const useCase = new CancelOrderUseCase(repository, users);
    const order = await useCase.execute({
      id: 1,
      actorId: 7,
      motivo: 'Cliente desistió del pedido.',
    });
    expect(order.estado).toBe('CANCELADO');
    expect(order.motivoCancelacion).toBe('Cliente desistió del pedido.');
    expect(repository.events[0].tipo).toBe('CANCELADO');
  });
});
