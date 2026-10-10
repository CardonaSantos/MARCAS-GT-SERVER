import {
  DispatchForbiddenError,
  DispatchOperationNotFoundError,
  DispatchOperationNotRetryableError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchOperationRepositoryPort } from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';
import {
  assertDispatchOperator,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class RetryDispatchOperationUseCase {
  constructor(
    private readonly operations: DispatchOperationRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly coordinator: DispatchOperationCoordinator,
  ) {}

  async execute(operationId: number, actorId: number) {
    const actor = await requireDispatchActor(this.users, actorId);
    assertDispatchOperator(actor);

    const operation = await this.operations.findById(operationId);
    if (!operation) throw new DispatchOperationNotFoundError(operationId);
    if (operation.empresaId !== actor.empresaId) {
      throw new DispatchForbiddenError();
    }

    if (operation.estado === 'APLICADA') {
      throw new DispatchOperationNotRetryableError(
        operation.id,
        operation.estado,
      );
    }

    if (
      operation.tipo === 'RESERVA_PREPARACION' &&
      operation.estadoDespacho === 'CANCELADA'
    ) {
      throw new DispatchOperationNotRetryableError(
        operation.id,
        operation.estadoDespacho,
      );
    }

    if (operation.tipo === 'SALIDA_DESPACHO') {
      const allLinesApplied = operation.detalles.every(
        (line) => line.estado === 'APLICADA',
      );
      const validState = [
        'PREPARADA',
        'PARCIALMENTE_DESPACHADA',
      ].includes(operation.estadoDespacho);

      if (
        !validState &&
        !(operation.estadoDespacho === 'DESPACHADA' && allLinesApplied)
      ) {
        throw new DispatchOperationNotRetryableError(
          operation.id,
          operation.estadoDespacho,
        );
      }
    }

    return this.coordinator.execute(operationId, actor);
  }
}
