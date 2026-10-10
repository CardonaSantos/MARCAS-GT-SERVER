import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchOperationFilters } from '../models/dispatch.models';
import { DispatchQueryPort } from '../ports/dispatch-query.port';
import {
  dispatchReadScope,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class ListDispatchOperationsUseCase {
  constructor(
    private readonly query: DispatchQueryPort,
    private readonly users: DispatchActorDirectoryPort,
  ) {}

  async execute(
    filters: Omit<DispatchOperationFilters, 'empresaId'>,
    actorId: number,
  ) {
    const actor = await requireDispatchActor(this.users, actorId);
    const scope = dispatchReadScope(actor);
    return this.query.listOperations({
      ...filters,
      empresaId: scope.empresaId,
      ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
    });
  }
}
