import { OrderDirectoryPort } from '../../../pedidos';
import {
  DispatchForbiddenError,
  DispatchIdempotencyConflictError,
  DispatchInvalidStateError,
  DispatchNotFoundError,
  DispatchOperationNotRetryableError,
  DispatchQuantityExceededError,
  DispatchValidationError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchOperationRepositoryPort } from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { RegisterDispatchOutputCommand } from '../models/dispatch.models';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';
import {
  assertDispatchOperator,
  assertNoFailedOperationPendingRetry,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class RegisterDispatchOutputUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly operations: DispatchOperationRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
    private readonly coordinator: DispatchOperationCoordinator,
  ) {}

  async execute(command: RegisterDispatchOutputCommand) {
    const actor = await requireDispatchActor(this.users, command.actorId);
    assertDispatchOperator(actor);

    const dispatch = await this.repository.findById(command.id);
    if (!dispatch) throw new DispatchNotFoundError(command.id);

    const order = await this.orders.findById(dispatch.pedidoId);
    if (!order || order.empresaId !== actor.empresaId) {
      throw new DispatchForbiddenError();
    }

    if (!command.detalles.length) {
      throw new DispatchValidationError(
        'Debe indicarse al menos una línea para registrar una salida.',
      );
    }

    const normalizedRequested = [...command.detalles]
      .map((line) => ({
        detalleId: line.detalleId,
        cantidad: line.cantidad,
      }))
      .sort((a, b) => a.detalleId - b.detalleId);

    if (
      normalizedRequested.some(
        (line, index) =>
          !Number.isInteger(line.detalleId) ||
          line.detalleId <= 0 ||
          !Number.isInteger(line.cantidad) ||
          line.cantidad <= 0 ||
          (index > 0 &&
            normalizedRequested[index - 1].detalleId === line.detalleId),
      )
    ) {
      throw new DispatchValidationError(
        'Las líneas de salida contienen datos inválidos o duplicados.',
      );
    }

    const existing = await this.operations.findByIdempotencyKey(
      command.claveIdempotencia,
    );

    if (existing) {
      const existingLines = [...existing.detalles]
        .map((line) => ({
          detalleId: line.ordenDespachoDetalleId,
          cantidad: line.cantidad,
        }))
        .sort((a, b) => a.detalleId - b.detalleId);

      const samePayload =
        existing.ordenDespachoId === dispatch.id &&
        existing.tipo === 'SALIDA_DESPACHO' &&
        existingLines.length === normalizedRequested.length &&
        existingLines.every(
          (line, index) =>
            line.detalleId === normalizedRequested[index].detalleId &&
            line.cantidad === normalizedRequested[index].cantidad,
        );

      if (!samePayload) {
        throw new DispatchIdempotencyConflictError({
          claveIdempotencia: command.claveIdempotencia,
          reason: 'La clave ya existe con otra salida.',
        });
      }

      const allLinesApplied = existing.detalles.every(
        (line) => line.estado === 'APLICADA',
      );

      if (
        existing.estado !== 'APLICADA' &&
        !['PREPARADA', 'PARCIALMENTE_DESPACHADA'].includes(dispatch.estado) &&
        !(dispatch.estado === 'DESPACHADA' && allLinesApplied)
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
      'SALIDA_DESPACHO',
    );

    if (!['PREPARADA', 'PARCIALMENTE_DESPACHADA'].includes(dispatch.estado)) {
      throw new DispatchInvalidStateError(
        dispatch.estado,
        'registrar salida física',
      );
    }

    const byId = new Map(
      dispatch.detalles.map((detail) => [detail.id!, detail]),
    );

    const lines = command.detalles.map((line) => {
      const detail = byId.get(line.detalleId);
      if (!detail) {
        throw new DispatchValidationError(
          'Una línea no pertenece a la orden de despacho.',
          { detalleId: line.detalleId },
        );
      }

      const available =
        (detail.cantidadPreparada ?? 0) -
        (detail.cantidadDespachada ?? 0);

      if (line.cantidad > available) {
        throw new DispatchQuantityExceededError({
          detalleId: line.detalleId,
          disponibleParaDespachar: available,
          solicitado: line.cantidad,
        });
      }

      return {
        ordenDespachoDetalleId: line.detalleId,
        cantidad: line.cantidad,
      };
    });

    const operation = await this.operations.prepare({
      ordenDespachoId: dispatch.id!,
      usuarioId: actor.id,
      tipo: 'SALIDA_DESPACHO',
      claveIdempotencia: command.claveIdempotencia,
      observaciones: command.observaciones ?? null,
      ocurridaEn: command.ocurridaEn ?? null,
      detalles: lines,
    });

    return this.coordinator.execute(operation.id, actor);
  }
}
