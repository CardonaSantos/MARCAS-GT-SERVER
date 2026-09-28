import { BodegaDirectoryPort } from '../../../bodegas';
import { RequisitionNotFoundError } from '../../domain/errors/requisition.errors';
import { RequisitionActorDirectoryPort } from '../../domain/ports/requisition-actor-directory.port';
import { RequisitionRepositoryPort } from '../../domain/ports/requisition.repository.port';
import { RequisitionActionCommand } from '../models/requisition.models';
import { requireActiveActor, requireActiveWarehouse } from './requisition-use-case.helpers';

export class RequestRequisitionUseCase {
  constructor(
    private readonly repository: RequisitionRepositoryPort,
    private readonly users: RequisitionActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
  ) {}

  async execute(command: RequisitionActionCommand) {
    await requireActiveActor(this.users, command.actorId);
    const entity = await this.repository.findById(command.id);
    if (!entity) throw new RequisitionNotFoundError(command.id);
    await requireActiveWarehouse(this.bodegas, entity.bodegaDestinoId);
    const expectedVersion = entity.version;
    entity.request();
    return this.repository.save(entity, expectedVersion, {
      actorId: command.actorId,
      type: 'SOLICITADA',
      detail: 'Requisición enviada para aprobación.',
    });
  }
}
