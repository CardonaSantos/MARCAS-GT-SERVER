import { InventoryAvailabilityPort } from '../../../inventario';
import { OrderDirectoryPort } from '../../../pedidos';
import {
  DispatchIdempotencyConflictError,
  DispatchInsufficientAvailabilityError,
  DispatchNotFoundError,
  DispatchOperationNotRetryableError,
  DispatchOrderNotEligibleError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchOperationRepositoryPort } from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { StartDispatchPreparationCommand } from '../models/dispatch.models';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';
import {
  assertDispatchOperator,
  assertNoFailedOperationPendingRetry,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class StartDispatchPreparationUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly operations: DispatchOperationRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
    private readonly availability: InventoryAvailabilityPort,
    private readonly coordinator: DispatchOperationCoordinator,
  ) {}

  async execute(command: StartDispatchPreparationCommand) {
    const actor = await requireDispatchActor(this.users, command.actorId);
    assertDispatchOperator(actor);

    const dispatch = await this.repository.findById(command.id);
    if (!dispatch) throw new DispatchNotFoundError(command.id);

    const order = await this.orders.findById(dispatch.pedidoId);
    if (!order || order.empresaId !== actor.empresaId) {
      throw new DispatchOrderNotEligibleError(order?.estado ?? 'NO_ENCONTRADO', {
        reason: 'El despacho no pertenece a la empresa del usuario.',
      });
    }

    const existing = await this.operations.findByIdempotencyKey(
      command.claveIdempotencia,
    );

    if (existing) {
      if (
        existing.ordenDespachoId !== dispatch.id ||
        existing.tipo !== 'RESERVA_PREPARACION'
      ) {
        throw new DispatchIdempotencyConflictError({
          claveIdempotencia: command.claveIdempotencia,
        });
      }

      if (
        existing.estado !== 'APLICADA' &&
        dispatch.estado === 'CANCELADA'
      ) {
        throw new DispatchOperationNotRetryableError(
          existing.id,
          dispatch.estado,
        );
      }

      return this.coordinator.execute(existing.id, actor);
    }

    await assertNoFailedOperationPendingRetry(
      this.operations,
      dispatch.id!,
      'RESERVA_PREPARACION',
    );

    if (dispatch.estado !== 'PENDIENTE') {
      throw new DispatchOrderNotEligibleError(dispatch.estado, {
        reason: 'Solo un despacho pendiente puede iniciar preparación.',
      });
    }

    const operation = await this.operations.prepare({
      ordenDespachoId: dispatch.id!,
      usuarioId: actor.id,
      tipo: 'RESERVA_PREPARACION',
      claveIdempotencia: command.claveIdempotencia,
      observaciones: command.observaciones ?? null,
      ocurridaEn: command.ocurridaEn ?? null,
      detalles: dispatch.detalles.map((detail) => ({
        ordenDespachoDetalleId: detail.id!,
        cantidad: detail.cantidadProgramada,
      })),
    });

    const unavailable: Array<{
      detalleId: number | null;
      productoId: number;
      cantidad: number;
    }> = [];

    for (const detail of dispatch.detalles) {
      const ok = await this.availability.hasAvailability(
        dispatch.bodegaId,
        detail.productoId,
        detail.cantidadProgramada,
      );
      if (!ok) {
        unavailable.push({
          detalleId: detail.id ?? null,
          productoId: detail.productoId,
          cantidad: detail.cantidadProgramada,
        });
      }
    }

    if (unavailable.length) {
      const error = new DispatchInsufficientAvailabilityError({
        bodegaId: dispatch.bodegaId,
        lineas: unavailable,
      });

      await this.operations.markOperationFailed(operation.id, error.message);
      await this.repository.appendEvent(dispatch.id!, {
        actorId: actor.id,
        tipo: 'OPERACION_FALLIDA',
        detalle: error.message,
        referencia: { tipo: 'OPERACION_DESPACHO', id: operation.id },
        metadata: {
          lineas: unavailable,
          fase: 'PRECHECK_DISPONIBILIDAD',
        },
        claveIdempotencia: `DISPATCH_OP:${operation.id}:PRECHECK_FAIL`,
      });
      throw error;
    }

    return this.coordinator.execute(operation.id, actor);
  }
}
