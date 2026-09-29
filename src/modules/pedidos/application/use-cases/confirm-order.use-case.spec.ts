import { OrderCreditApprovalRequiredError } from '../../domain/errors/order.errors';
import { ConfirmOrderUseCase } from './confirm-order.use-case';
import { FakeOrderActorDirectory, FakeOrderRepository, adminActor, draftOrder } from '../../testing/order.fakes';

describe('ConfirmOrderUseCase', () => {
  it('confirma PREPAGO pendiente de validación', async () => {
    const repository = new FakeOrderRepository();
    const users = new FakeOrderActorDirectory();
    const order = draftOrder({ vendedorId: 3, condicionPago: 'PREPAGO' });
    order.requestValidation();
    repository.entity = order;
    users.users.set(3, adminActor(3));
    const useCase = new ConfirmOrderUseCase(repository, users);
    const confirmed = await useCase.execute({ id: 1, actorId: 3 });
    expect(confirmed.estado).toBe('CONFIRMADO');
    expect(repository.events[0].tipo).toBe('CONFIRMADO');
  });

  it('bloquea CREDITO hasta integrar aprobación', async () => {
    const repository = new FakeOrderRepository();
    const users = new FakeOrderActorDirectory();
    const order = draftOrder({ vendedorId: 3, condicionPago: 'CREDITO' });
    order.requestValidation();
    repository.entity = order;
    users.users.set(3, adminActor(3));
    const useCase = new ConfirmOrderUseCase(repository, users);
    await expect(useCase.execute({ id: 1, actorId: 3 })).rejects.toBeInstanceOf(
      OrderCreditApprovalRequiredError,
    );
  });
});
