import { DispatchNotFoundError } from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchQueryPort } from '../ports/dispatch-query.port';
import {
  dispatchReadScope,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class GetDispatchUseCase {
  constructor(
    private readonly query: DispatchQueryPort,
    private readonly users: DispatchActorDirectoryPort,
  ) {}

  async execute(id: number, actorId: number) {
    const actor = await requireDispatchActor(this.users, actorId);
    const result = await this.query.getById(id, dispatchReadScope(actor));
    if (!result) throw new DispatchNotFoundError(id);
    return result;
  }
}
