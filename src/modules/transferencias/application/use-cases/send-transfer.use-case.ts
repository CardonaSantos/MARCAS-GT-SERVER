import { BodegaDirectoryPort } from '../../../bodegas';
import { InventoryOperationsPort } from '../../../inventario';
import {
  TransferError,
  TransferInventoryContractError,
  TransferInventoryOperationFailedError,
  TransferValidationError,
} from '../../domain/errors/transfer.errors';
import { TransferActorDirectoryPort } from '../../domain/ports/transfer-actor-directory.port';
import { TransferOperationRepositoryPort } from '../ports/transfer-operation.repository.port';
import {
  RegisterTransferOperationResult,
  RegisterTransferOutboundCommand,
} from '../models/transfer.models';
import {
  requireActiveTransferActor,
  requireTransferWarehouses,
} from './transfer-use-case.helpers';

export class SendTransferUseCase {
  constructor(
    private readonly operations: TransferOperationRepositoryPort,
    private readonly users: TransferActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly inventory: InventoryOperationsPort,
  ) {}

  async execute(
    command: RegisterTransferOutboundCommand,
  ): Promise<RegisterTransferOperationResult> {
    await requireActiveTransferActor(this.users, command.actorId);

    const key = command.claveIdempotencia?.trim();
    if (!key) {
      throw new TransferValidationError(
        'La clave de idempotencia es obligatoria.',
      );
    }

    // La idempotencia se resuelve antes de volver a evaluar el workflow.
    // Un reintento exitoso puede encontrar la transferencia en un estado
    // posterior a PREPARADA.
    const operation = await this.operations.prepareOperation({
      transferenciaId: command.transferenciaId,
      usuarioId: command.actorId,
      tipo: 'SALIDA',
      claveIdempotencia: key,
      documentoReferencia: command.documentoReferencia,
      observaciones: command.observaciones,
      ocurridaEn: command.ocurridaEn,
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
      await requireTransferWarehouses(
        this.bodegas,
        operation.bodegaOrigenId,
        operation.bodegaDestinoId,
      );

      for (const line of operation.detalles) {
        const result = await this.inventory.registerTransferOut({
          bodegaId: operation.bodegaOrigenId,
          productoId: line.productoId,
          cantidad: line.cantidad,
          transferenciaId: operation.transferenciaId,
          observaciones: command.observaciones ?? null,
          claveIdempotencia:
            `TRANSFERENCIA:OPERACION:${operation.id}:DETALLE:${line.id}`,
          actorId: command.actorId,
        });

        const historicalCost = result.movimiento?.costoUnitario;
        if (historicalCost == null) {
          throw new TransferInventoryContractError({
            operationId: operation.id,
            operationDetailId: line.id,
            movimientoId: result.movimientoId,
          });
        }

        await this.operations.registerLineResult({
          operacionDetalleId: line.id,
          costoUnitario: historicalCost,
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
        'No fue posible registrar la salida de inventario de la transferencia.',
        {
          operationId: operation.id,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
