import { OrderForbiddenError, OrderNotFoundError } from '../../domain/errors/order.errors';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { requireOrderActor } from './order-use-case.helpers';

export class ConfirmOrderUseCase {
  constructor(
    private readonly repository: OrderRepositoryPort,
    private readonly users: OrderActorDirectoryPort,
  ) {}

  async execute(command: { id: number; actorId: number }) {
    const actor = await requireOrderActor(this.users, command.actorId);
    if (actor.rol !== 'ADMIN') {
      throw new OrderForbiddenError('Solo ADMIN puede confirmar pedidos.');
    }
    const order = await this.repository.findById(command.id);
    if (!order) throw new OrderNotFoundError(command.id);
    if (order.empresaId !== actor.empresaId) throw new OrderForbiddenError();
    const expectedVersion = order.version;
    order.confirm(new Date(), false);
    return this.repository.save(order, expectedVersion, {
      actorId: actor.id,
      tipo: 'CONFIRMADO',
      detalle: 'Pedido confirmado.',
    });
  }
}
