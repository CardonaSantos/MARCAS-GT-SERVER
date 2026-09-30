import { BodegaDirectoryPort } from '../../../bodegas';
import { RequisitionNotFoundError } from '../../domain/errors/requisition.errors';
import { RequisitionActorDirectoryPort } from '../../domain/ports/requisition-actor-directory.port';
import { RequisitionCatalogPort } from '../../domain/ports/requisition-catalog.port';
import { RequisitionRepositoryPort } from '../../domain/ports/requisition.repository.port';
import { RequisitionActionCommand } from '../models/requisition.models';
import { requireActiveActor, requireActiveWarehouse, requireProvider } from './requisition-use-case.helpers';

export class ApproveRequisitionUseCase {
  constructor(
    private readonly repository: RequisitionRepositoryPort,
    private readonly users: RequisitionActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly catalog: RequisitionCatalogPort,
  ) {}

  async execute(command: RequisitionActionCommand) {
    await requireActiveActor(this.users, command.actorId);
    const entity = await this.repository.findById(command.id);
    if (!entity) throw new RequisitionNotFoundError(command.id);
    await requireActiveWarehouse(this.bodegas, entity.bodegaDestinoId);
    if (entity.proveedorId) await requireProvider(this.catalog, entity.proveedorId);
    const expectedVersion = entity.version;
    entity.approve();
    return this.repository.save(entity, expectedVersion, {
      actorId: command.actorId,
      type: 'APROBADA',
      detail: 'Requisición aprobada.',
    });
  }
}
