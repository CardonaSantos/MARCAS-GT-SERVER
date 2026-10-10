import { OrderDirectoryPort } from '../../../pedidos';
import {
  DispatchForbiddenError,
  DispatchInvalidStateError,
  DispatchNotFoundError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchOperationRepositoryPort } from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { CancelDispatchCommand } from '../models/dispatch.models';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';
import {
  assertDispatchOperator,
  assertNoFailedOperationPendingRetry,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class CancelDispatchUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly operations: DispatchOperationRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
    private readonly coordinator: DispatchOperationCoordinator,
  ) {}

  async execute(command: CancelDispatchCommand) {
    const actor = await requireDispatchActor(this.users, command.actorId);
    assertDispatchOperator(actor);

    const dispatch = await this.repository.findById(command.id);
    if (!dispatch) throw new DispatchNotFoundError(command.id);

    const order = await this.orders.findById(dispatch.pedidoId);
    if (!order || order.empresaId !== actor.empresaId) {
      throw new DispatchForbiddenError();
    }

    if (dispatch.estado === 'CANCELADA') {
      return {
        operationId: null,
        dispatchId: dispatch.id!,
        repeated: true,
        status: 'APLICADA' as const,
      };
    }

    if (!['PENDIENTE', 'PREPARANDO', 'PREPARADA'].includes(dispatch.estado)) {
      throw new DispatchInvalidStateError(dispatch.estado, 'cancelar');
    }

    if (
      dispatch.detalles.some(
        (detail) => (detail.cantidadDespachada ?? 0) > 0,
      ) ||
      (await this.operations.hasPhysicalDispatchActivity(dispatch.id!))
    ) {
      throw new DispatchInvalidStateError(
        dispatch.estado,
        'cancelar una orden con salida física',
      );
    }

    await assertNoFailedOperationPendingRetry(
      this.operations,
      dispatch.id!,
      'LIBERACION_RESERVA',
    );

    const netReservations =
      await this.operations.netReservationsForDispatch(dispatch.id!);

    if (netReservations.length === 0) {
      const expected = dispatch.version;
      dispatch.cancel(
        command.motivo,
        actor.id,
        command.ocurridaEn ?? new Date(),
      );

      await this.repository.save(dispatch, expected, [
        {
          actorId: actor.id,
          tipo: 'CANCELADA',
          detalle: dispatch.motivoCancelacion,
          claveIdempotencia: `DISPATCH_CANCEL:${dispatch.id}:${command.claveIdempotencia}`,
        },
      ]);

      return {
        operationId: null,
        dispatchId: dispatch.id!,
        repeated: false,
        status: 'APLICADA' as const,
      };
    }

    const operation = await this.operations.prepare({
      ordenDespachoId: dispatch.id!,
      usuarioId: actor.id,
      tipo: 'LIBERACION_RESERVA',
      claveIdempotencia: command.claveIdempotencia,
      observaciones: command.motivo,
      ocurridaEn: command.ocurridaEn ?? null,
      detalles: netReservations.map((line) => ({
        ordenDespachoDetalleId: line.ordenDespachoDetalleId,
        cantidad: line.cantidad,
      })),
    });

    return this.coordinator.execute(operation.id, actor);
  }
}
