import { OrderNotFoundError } from '../../domain/errors/order.errors';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderEventFilters } from '../models/order.models';
import { OrderQueryPort } from '../ports/order-query.port';
import { readScopeForActor, requireOrderActor } from './order-use-case.helpers';

export class ListOrderEventsUseCase {
  constructor(
    private readonly query: OrderQueryPort,
    private readonly users: OrderActorDirectoryPort,
  ) {}

  async execute(
    pedidoId: number,
    filters: Omit<OrderEventFilters, 'empresaId' | 'vendedorId'>,
    actorId: number,
  ) {
    const actor = await requireOrderActor(this.users, actorId);
    const scope = readScopeForActor(actor);
    const exists = await this.query.getById(pedidoId, scope);
    if (!exists) throw new OrderNotFoundError(pedidoId);
    return this.query.listEvents(pedidoId, {
      ...filters,
      empresaId: scope.empresaId,
      ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
    });
  }
}
