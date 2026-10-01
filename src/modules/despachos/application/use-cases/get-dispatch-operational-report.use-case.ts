import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchOperationalReportFilters } from '../models/dispatch.models';
import { DispatchQueryPort } from '../ports/dispatch-query.port';
import {
  dispatchReadScope,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class GetDispatchOperationalReportUseCase {
  constructor(
    private readonly query: DispatchQueryPort,
    private readonly users: DispatchActorDirectoryPort,
  ) {}

  async execute(
    filters: Omit<DispatchOperationalReportFilters, 'empresaId'>,
    actorId: number,
  ) {
    const actor = await requireDispatchActor(this.users, actorId);
    const scope = dispatchReadScope(actor);

    return this.query.getOperationalReport({
      ...filters,
      empresaId: scope.empresaId,
      ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
    });
  }
}
