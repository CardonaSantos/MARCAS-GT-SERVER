import { RequestOrderValidationUseCase } from './request-order-validation.use-case';
import { FakeOrderActorDirectory, FakeOrderRepository, draftOrder, sellerActor } from '../../testing/order.fakes';

describe('RequestOrderValidationUseCase', () => {
  it('permite al vendedor propietario solicitar validación', async () => {
    const repository = new FakeOrderRepository();
    const users = new FakeOrderActorDirectory();
    repository.entity = draftOrder();
    users.users.set(7, sellerActor(7));
    const useCase = new RequestOrderValidationUseCase(repository, users);
    const order = await useCase.execute({ id: 1, actorId: 7 });
    expect(order.estado).toBe('PENDIENTE_VALIDACION');
    expect(repository.events[0].tipo).toBe('VALIDACION_SOLICITADA');
  });
});
