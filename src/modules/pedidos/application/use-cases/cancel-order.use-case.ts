import { OrderNotFoundError } from '../../domain/errors/order.errors';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { assertOrderWriteAccess, requireOrderActor } from './order-use-case.helpers';

export class CancelOrderUseCase {
  constructor(
    private readonly repository: OrderRepositoryPort,
    private readonly users: OrderActorDirectoryPort,
  ) {}

  async execute(command: { id: number; motivo: string; actorId: number }) {
    const actor = await requireOrderActor(this.users, command.actorId);
    const order = await this.repository.findById(command.id);
    if (!order) throw new OrderNotFoundError(command.id);
    assertOrderWriteAccess(actor, order);
    const expectedVersion = order.version;
    order.cancel(command.motivo);
    return this.repository.save(order, expectedVersion, {
      actorId: actor.id,
      tipo: 'CANCELADO',
      detalle: command.motivo.trim(),
    });
  }
}
