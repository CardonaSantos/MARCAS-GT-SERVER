import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchCandidateFilters } from '../models/dispatch.models';
import { DispatchQueryPort } from '../ports/dispatch-query.port';
import {
  dispatchReadScope,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class ListDispatchCandidatesUseCase {
  constructor(
    private readonly query: DispatchQueryPort,
    private readonly users: DispatchActorDirectoryPort,
  ) {}

  async execute(
    filters: Omit<DispatchCandidateFilters, 'empresaId'>,
    actorId: number,
  ) {
    const actor = await requireDispatchActor(this.users, actorId);
    const scope = dispatchReadScope(actor);

    return this.query.listCandidates({
      ...filters,
      empresaId: scope.empresaId,
      ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
    });
  }
}
