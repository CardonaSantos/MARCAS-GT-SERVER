import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderListFilters } from '../models/order.models';
import { OrderQueryPort } from '../ports/order-query.port';
import { readScopeForActor, requireOrderActor } from './order-use-case.helpers';

export class ListOrdersUseCase {
  constructor(
    private readonly query: OrderQueryPort,
    private readonly users: OrderActorDirectoryPort,
  ) {}

  async execute(filters: Omit<OrderListFilters, 'empresaId'>, actorId: number) {
    const actor = await requireOrderActor(this.users, actorId);
    const scope = readScopeForActor(actor);
    return this.query.list({
      ...filters,
      empresaId: scope.empresaId,
      ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
    });
  }
}
