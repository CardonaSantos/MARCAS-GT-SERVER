import {
  InventoryOperationsPort,
  InventoryReservationDirectoryPort,
} from '../../../inventario';
import { OrderDispatchGatePort } from '../../../pedidos';
import {
  DispatchInventoryContractError,
  DispatchInventoryOperationFailedError,
  DispatchOrderIntegrationFailedError,
  DispatchOperationConflictError,
} from '../../domain/errors/dispatch.errors';
import { DispatchOperationRepositoryPort } from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { errorMessage } from './dispatch-use-case.helpers';

export class DispatchOperationCoordinator {
  constructor(
    private readonly operations: DispatchOperationRepositoryPort,
    private readonly dispatches: DispatchRepositoryPort,
    private readonly inventory: InventoryOperationsPort,
    private readonly reservations: InventoryReservationDirectoryPort,
    private readonly orders: OrderDispatchGatePort,
  ) {}

  async execute(
    operationId: number,
    actor: { id: number; empresaId: number },
  ) {
    const before = await this.operations.findById(operationId);
    if (!before) {
      throw new DispatchOperationConflictError({ operationId });
    }

    if (before.empresaId !== actor.empresaId) {
      throw new DispatchOperationConflictError({
        operationId,
        reason: 'La operación pertenece a otra empresa.',
      });
    }

    if (before.estado === 'APLICADA') {
      return {
        operationId: before.id,
        dispatchId: before.ordenDespachoId,
        repeated: true,
        status: 'APLICADA' as const,
      };
    }

    const operation = await this.operations.beginAttempt(operationId);

    if (before.estado === 'FALLIDA') {
      await this.dispatches.appendEvent(operation.ordenDespachoId, {
        actorId: actor.id,
        tipo: 'OPERACION_REINTENTADA',
        detalle: `Se reintentó la operación #${operation.id} (${operation.tipo}).`,
        referencia: { tipo: 'OPERACION_DESPACHO', id: operation.id },
        metadata: { intento: operation.intentos },
        claveIdempotencia: `DISPATCH_OP:${operation.id}:RETRY:${operation.intentos}`,
      });
    }

    try {
      if (operation.tipo === 'RESERVA_PREPARACION') {
        await this.executeReservation(operation, actor);
      } else if (operation.tipo === 'SALIDA_DESPACHO') {
        await this.executeDispatch(operation, actor);
      } else {
        await this.executeRelease(operation, actor);
      }

      await this.operations.markOperationApplied(operation.id);
      await this.finalizeBusinessState(operation.id, actor);

      return {
        operationId: operation.id,
        dispatchId: operation.ordenDespachoId,
        repeated: operation.repeated,
        status: 'APLICADA' as const,
      };
    } catch (error) {
      const message = errorMessage(error);
      await this.operations.markOperationFailed(operation.id, message);
      await this.dispatches.appendEvent(operation.ordenDespachoId, {
        actorId: actor.id,
        tipo: 'OPERACION_FALLIDA',
        detalle: `Operación #${operation.id} fallida: ${message}`,
        referencia: { tipo: 'OPERACION_DESPACHO', id: operation.id },
        metadata: {
          tipo: operation.tipo,
          intento: operation.intentos,
          error: message,
        },
        claveIdempotencia: `DISPATCH_OP:${operation.id}:FAIL:${operation.intentos}`,
      });
      throw error;
    }
  }

  private async executeReservation(operation: any, actor: any) {
    for (const line of operation.detalles) {
      if (line.estado === 'APLICADA') continue;

      try {
        const result = await this.inventory.reserve({
          pedidoDetalleId: line.pedidoDetalleId,
          bodegaId: operation.bodegaId,
          cantidad: line.cantidad,
          claveIdempotencia: line.claveIdempotencia,
          actorId: actor.id,
        });

        this.assertInventoryResult(result, line.id);
        await this.operations.recordInventoryResult(
          line.id,
          result.reservaId!,
          result.movimientoId,
        );
        await this.operations.markLineApplied(line.id);
      } catch (error) {
        await this.operations.markLineFailed(line.id, errorMessage(error));
        if (error instanceof DispatchInventoryContractError) throw error;
        throw new DispatchInventoryOperationFailedError({
          operationId: operation.id,
          lineId: line.id,
          pedidoDetalleId: line.pedidoDetalleId,
          cause: errorMessage(error),
        });
      }
    }
  }

  private async executeDispatch(operation: any, actor: any) {
    for (const line of operation.detalles) {
      if (line.estado === 'APLICADA') continue;

      try {
        const reservation =
          await this.reservations.findByOrderDetailAndBodega(
            line.pedidoDetalleId,
            operation.bodegaId,
          );

        if (!reservation) {
          throw new DispatchInventoryContractError({
            operationId: operation.id,
            lineId: line.id,
            reason: 'No existe una reserva asociada a la línea y bodega.',
          });
        }

        const result = await this.inventory.applyReservation({
          reservaId: reservation.id,
          cantidad: line.cantidad,
          reference: {
            type: 'OPERACION_DESPACHO_DETALLE',
            id: line.id,
          },
          observaciones: operation.observaciones,
          claveIdempotencia: line.claveIdempotencia,
          actorId: actor.id,
        });

        this.assertInventoryResult(result, line.id);

        await this.operations.recordInventoryResult(
          line.id,
          result.reservaId!,
          result.movimientoId,
        );

        try {
          await this.orders.registerDispatch({
            pedidoId: operation.pedidoId,
            pedidoDetalleId: line.pedidoDetalleId,
            cantidad: line.cantidad,
            movimientoInventarioId: result.movimientoId,
            operacionDespachoDetalleId: line.id,
            actorId: actor.id,
            empresaId: actor.empresaId,
          });
        } catch (error) {
          throw new DispatchOrderIntegrationFailedError({
            operationId: operation.id,
            lineId: line.id,
            movimientoInventarioId: result.movimientoId,
            cause: errorMessage(error),
          });
        }

        await this.operations.commitDispatchLine(
          line.id,
          actor.id,
          operation.ocurridaEn,
        );
      } catch (error) {
        await this.operations.markLineFailed(line.id, errorMessage(error));
        if (
          error instanceof DispatchInventoryContractError ||
          error instanceof DispatchOrderIntegrationFailedError
        ) {
          throw error;
        }
        throw new DispatchInventoryOperationFailedError({
          operationId: operation.id,
          lineId: line.id,
          cause: errorMessage(error),
        });
      }
    }
  }

  private async executeRelease(operation: any, actor: any) {
    for (const line of operation.detalles) {
      if (line.estado === 'APLICADA') continue;

      try {
        const reservation =
          await this.reservations.findByOrderDetailAndBodega(
            line.pedidoDetalleId,
            operation.bodegaId,
          );

        if (!reservation) {
          throw new DispatchInventoryContractError({
            operationId: operation.id,
            lineId: line.id,
            reason: 'No existe la reserva que debe liberarse.',
          });
        }

        const result = await this.inventory.releaseReservation({
          reservaId: reservation.id,
          cantidad: line.cantidad,
          reference: {
            type: 'OPERACION_DESPACHO_DETALLE',
            id: line.id,
          },
          observaciones: operation.observaciones,
          claveIdempotencia: line.claveIdempotencia,
          actorId: actor.id,
        });

        this.assertInventoryResult(result, line.id);
        await this.operations.recordInventoryResult(
          line.id,
          result.reservaId!,
          result.movimientoId,
        );
        await this.operations.markLineApplied(line.id);
      } catch (error) {
        await this.operations.markLineFailed(line.id, errorMessage(error));
        if (error instanceof DispatchInventoryContractError) throw error;
        throw new DispatchInventoryOperationFailedError({
          operationId: operation.id,
          lineId: line.id,
          cause: errorMessage(error),
        });
      }
    }
  }

  private async finalizeBusinessState(
    operationId: number,
    actor: { id: number; empresaId: number },
  ) {
    const operation = await this.operations.findById(operationId);
    if (!operation) {
      throw new DispatchOperationConflictError({ operationId });
    }

    if (operation.tipo === 'RESERVA_PREPARACION') {
      try {
        await this.orders.startPreparation({
          pedidoId: operation.pedidoId,
          ordenDespachoId: operation.ordenDespachoId,
          actorId: actor.id,
          empresaId: actor.empresaId,
        });
      } catch (error) {
        throw new DispatchOrderIntegrationFailedError({
          operationId: operation.id,
          pedidoId: operation.pedidoId,
          phase: 'START_PREPARATION',
          cause: errorMessage(error),
        });
      }

      const dispatch = await this.dispatches.findById(
        operation.ordenDespachoId,
      );

      if (dispatch?.estado === 'PENDIENTE') {
        const expected = dispatch.version;
        dispatch.markPreparationStarted(operation.ocurridaEn);
        await this.dispatches.save(dispatch, expected, [
          {
            actorId: actor.id,
            tipo: 'PREPARACION_INICIADA',
            detalle: `Preparación iniciada mediante operación #${operation.id}.`,
            referencia: { tipo: 'OPERACION_DESPACHO', id: operation.id },
            claveIdempotencia: `DISPATCH_OP:${operation.id}:PREP_STARTED`,
          },
        ]);
      }
      return;
    }

    if (operation.tipo === 'LIBERACION_RESERVA') {
      try {
        await this.orders.releasePreparation({
          pedidoId: operation.pedidoId,
          ordenDespachoId: operation.ordenDespachoId,
          operacionDespachoId: operation.id,
          actorId: actor.id,
          empresaId: actor.empresaId,
        });
      } catch (error) {
        throw new DispatchOrderIntegrationFailedError({
          operationId: operation.id,
          pedidoId: operation.pedidoId,
          phase: 'RELEASE_PREPARATION',
          cause: errorMessage(error),
        });
      }

      const dispatch = await this.dispatches.findById(
        operation.ordenDespachoId,
      );

      if (dispatch && dispatch.estado !== 'CANCELADA') {
        const expected = dispatch.version;
        dispatch.cancel(
          operation.observaciones ?? 'Cancelación de preparación.',
          actor.id,
          operation.ocurridaEn,
        );
        await this.dispatches.save(dispatch, expected, [
          {
            actorId: actor.id,
            tipo: 'CANCELADA',
            detalle: dispatch.motivoCancelacion,
            referencia: { tipo: 'OPERACION_DESPACHO', id: operation.id },
            claveIdempotencia: `DISPATCH_OP:${operation.id}:CANCELLED`,
          },
        ]);
      }
      return;
    }

    const dispatch = await this.dispatches.findById(
      operation.ordenDespachoId,
    );
    if (!dispatch) {
      throw new DispatchOperationConflictError({
        operationId,
        reason: 'No fue posible recargar la orden de despacho.',
      });
    }

    const eventType =
      dispatch.estado === 'DESPACHADA'
        ? 'DESPACHADA'
        : 'DESPACHO_PARCIAL';

    const units = operation.detalles.reduce(
      (sum, line) => sum + line.cantidad,
      0,
    );

    await this.dispatches.appendEvent(dispatch.id!, {
      actorId: actor.id,
      tipo: eventType,
      detalle:
        eventType === 'DESPACHADA'
          ? `Orden despachada completamente mediante operación #${operation.id}.`
          : `Salida parcial #${operation.id}: ${units} unidades procesadas.`,
      referencia: { tipo: 'OPERACION_DESPACHO', id: operation.id },
      metadata: {
        unidades: units,
        lineas: operation.detalles.length,
      },
      claveIdempotencia: `DISPATCH_OP:${operation.id}:FINAL`,
    });
  }

  private assertInventoryResult(result: any, lineId: number) {
    if (
      !result ||
      !Number.isInteger(result.movimientoId) ||
      result.movimientoId <= 0 ||
      !Number.isInteger(result.reservaId) ||
      result.reservaId <= 0
    ) {
      throw new DispatchInventoryContractError({ lineId, result });
    }
  }
}
