import { BodegaDirectoryPort } from '../../../bodegas';
import { InventoryOperationsPort } from '../../../inventario';
import {
  TransferError,
  TransferInventoryOperationFailedError,
  TransferValidationError,
} from '../../domain/errors/transfer.errors';
import { TransferActorDirectoryPort } from '../../domain/ports/transfer-actor-directory.port';
import {
  RegisterTransferOperationResult,
  RegisterTransferReceiptCommand,
} from '../models/transfer.models';
import { TransferOperationRepositoryPort } from '../ports/transfer-operation.repository.port';
import {
  requireActiveDestinationWarehouse,
  requireActiveTransferActor,
} from './transfer-use-case.helpers';

export class ReceiveTransferUseCase {
  constructor(
    private readonly operations: TransferOperationRepositoryPort,
    private readonly users: TransferActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly inventory: InventoryOperationsPort,
  ) {}

  async execute(
    command: RegisterTransferReceiptCommand,
  ): Promise<RegisterTransferOperationResult> {
    await requireActiveTransferActor(this.users, command.actorId);

    const key = command.claveIdempotencia?.trim();
    if (!key) {
      throw new TransferValidationError(
        'La clave de idempotencia es obligatoria.',
      );
    }
    if (!command.detalles.length) {
      throw new TransferValidationError(
        'La recepción debe contener al menos un detalle.',
      );
    }

    // Mismo principio que SALIDA: primero recuperamos la operación por
    // idempotencia. Una recepción ya aplicada debe ser repetible incluso si
    // la transferencia ahora está RECIBIDA.
    const operation = await this.operations.prepareOperation({
      transferenciaId: command.transferenciaId,
      usuarioId: command.actorId,
      tipo: 'RECEPCION',
      claveIdempotencia: key,
      documentoReferencia: command.documentoReferencia,
      observaciones: command.observaciones,
      ocurridaEn: command.ocurridaEn,
      detalles: command.detalles,
    });

    if (operation.estado === 'APLICADA') {
      return {
        repeated: true,
        operationId: operation.id,
        transferenciaId: operation.transferenciaId,
        estadoOperacion: operation.estado,
        estadoTransferencia: operation.estadoTransferencia,
      };
    }

    try {
      await requireActiveDestinationWarehouse(
        this.bodegas,
        operation.bodegaDestinoId,
      );

      for (const line of operation.detalles) {
        if (line.costoUnitario == null) {
          throw new TransferValidationError(
            'La recepción no tiene el costo histórico de salida requerido.',
            {
              operationId: operation.id,
              operationDetailId: line.id,
            },
          );
        }

        await this.inventory.registerTransferIn({
          bodegaId: operation.bodegaDestinoId,
          productoId: line.productoId,
          cantidad: line.cantidad,
          costoUnitario: line.costoUnitario,
          transferenciaId: operation.transferenciaId,
          observaciones: command.observaciones ?? null,
          claveIdempotencia:
            `TRANSFERENCIA:OPERACION:${operation.id}:DETALLE:${line.id}`,
          actorId: command.actorId,
        });
      }

      const finalized = await this.operations.finalizeOperation(
        operation.id,
        command.actorId,
      );

      return {
        repeated: operation.repeated,
        operationId: finalized.operacionId,
        transferenciaId: finalized.transferenciaId,
        estadoOperacion: finalized.estadoOperacion,
        estadoTransferencia: finalized.estadoTransferencia,
      };
    } catch (error) {
      await this.operations.markOperationFailed(
        operation.id,
        error instanceof Error ? error.message : 'Error desconocido.',
      );

      if (error instanceof TransferError) throw error;

      throw new TransferInventoryOperationFailedError(
        'No fue posible registrar la recepción de inventario de la transferencia.',
        {
          operationId: operation.id,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
