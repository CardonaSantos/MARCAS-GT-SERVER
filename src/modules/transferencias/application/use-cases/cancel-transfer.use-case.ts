import {
  TransferNotFoundError,
  TransferOperationConflictError,
} from '../../domain/errors/transfer.errors';
import { TransferActorDirectoryPort } from '../../domain/ports/transfer-actor-directory.port';
import { TransferRepositoryPort } from '../../domain/ports/transfer.repository.port';
import { TransferReasonCommand } from '../models/transfer.models';
import { TransferOperationRepositoryPort } from '../ports/transfer-operation.repository.port';
import { requireActiveTransferActor } from './transfer-use-case.helpers';

export class CancelTransferUseCase {
  constructor(
    private readonly repository: TransferRepositoryPort,
    private readonly operations: TransferOperationRepositoryPort,
    private readonly users: TransferActorDirectoryPort,
  ) {}

  async execute(command: TransferReasonCommand) {
    await requireActiveTransferActor(this.users, command.actorId);

    const entity = await this.repository.findById(command.id);
    if (!entity) throw new TransferNotFoundError(command.id);

    if (await this.operations.hasUnresolvedOperations(command.id)) {
      throw new TransferOperationConflictError({
        transferenciaId: command.id,
        reason:
          'La transferencia tiene una operación física pendiente o fallida. Debe resolverse con la misma clave de idempotencia antes de cancelar.',
      });
    }

    const expectedVersion = entity.version;
    entity.cancel(command.motivo);

    return this.repository.save(entity, expectedVersion, {
      actorId: command.actorId,
      type: 'CANCELADA',
      detail: `Transferencia cancelada. Motivo: ${command.motivo.trim()}`,
    });
  }
}
