import { RequisitionNotFoundError } from '../../domain/errors/requisition.errors';
import { RequisitionActorDirectoryPort } from '../../domain/ports/requisition-actor-directory.port';
import { RequisitionRepositoryPort } from '../../domain/ports/requisition.repository.port';
import { RequisitionReasonCommand } from '../models/requisition.models';
import { requireActiveActor } from './requisition-use-case.helpers';

export class RejectRequisitionUseCase {
  constructor(
    private readonly repository: RequisitionRepositoryPort,
    private readonly users: RequisitionActorDirectoryPort,
  ) {}
  async execute(command: RequisitionReasonCommand) {
    await requireActiveActor(this.users, command.actorId);
    const entity = await this.repository.findById(command.id);
    if (!entity) throw new RequisitionNotFoundError(command.id);
    const expectedVersion = entity.version;
    entity.reject(command.motivo);
    return this.repository.save(entity, expectedVersion, {
      actorId: command.actorId,
      type: 'RECHAZADA',
      detail: `Requisición rechazada: ${command.motivo.trim()}`,
    });
  }
}
