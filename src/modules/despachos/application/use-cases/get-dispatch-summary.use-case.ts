import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchSummaryFilters } from '../models/dispatch.models';
import { DispatchQueryPort } from '../ports/dispatch-query.port';
import {
  dispatchReadScope,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class GetDispatchSummaryUseCase {
  constructor(
    private readonly query: DispatchQueryPort,
    private readonly users: DispatchActorDirectoryPort,
  ) {}

  async execute(
    filters: Omit<DispatchSummaryFilters, 'empresaId'>,
    actorId: number,
  ) {
    const actor = await requireDispatchActor(this.users, actorId);
    const scope = dispatchReadScope(actor);
    return this.query.getSummary({
      ...filters,
      empresaId: scope.empresaId,
      ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
    });
  }
}
