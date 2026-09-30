import { OrderNotFoundError } from '../../domain/errors/order.errors';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderQueryPort } from '../ports/order-query.port';
import { readScopeForActor, requireOrderActor } from './order-use-case.helpers';

export class GetOrderUseCase {
  constructor(
    private readonly query: OrderQueryPort,
    private readonly users: OrderActorDirectoryPort,
  ) {}

  async execute(id: number, actorId: number) {
    const actor = await requireOrderActor(this.users, actorId);
    const result = await this.query.getById(id, readScopeForActor(actor));
    if (!result) throw new OrderNotFoundError(id);
    return result;
  }
}
