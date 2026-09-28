import { InventoryOperationsPort } from '../../../inventario';
import { BodegaDirectoryPort } from '../../../bodegas';
import {
  RequisitionNotFoundError,
  RequisitionValidationError,
} from '../../domain/errors/requisition.errors';
import { RequisitionActorDirectoryPort } from '../../domain/ports/requisition-actor-directory.port';
import { RequisitionCatalogPort } from '../../domain/ports/requisition-catalog.port';
import { RequisitionRepositoryPort } from '../../domain/ports/requisition.repository.port';
import {
  RegisterReceiptCommand,
  RegisterReceiptResult,
} from '../models/requisition.models';
import {
  requireActiveActor,
  requireActiveWarehouse,
  requireProvider,
} from './requisition-use-case.helpers';

export class RegisterRequisitionReceiptUseCase {
  constructor(
    private readonly repository: RequisitionRepositoryPort,
    private readonly users: RequisitionActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly catalog: RequisitionCatalogPort,
    private readonly inventory: InventoryOperationsPort,
  ) {}

  async execute(
    command: RegisterReceiptCommand,
  ): Promise<RegisterReceiptResult> {
    await requireActiveActor(this.users, command.actorId);

    if (!command.claveIdempotencia.trim()) {
      throw new RequisitionValidationError(
        'La clave de idempotencia es obligatoria.',
      );
    }

    if (!command.detalles.length) {
      throw new RequisitionValidationError(
        'La recepción debe contener al menos un detalle.',
      );
    }

    const receipt = await this.repository.prepareReceipt({
      requisicionId: command.requisicionId,
      recibidoPorId: command.actorId,
      claveIdempotencia: command.claveIdempotencia.trim(),
      documentoReferencia: command.documentoReferencia ?? null,
      observaciones: command.observaciones ?? null,
      recibidoEn: command.recibidoEn ?? null,
      detalles: command.detalles,
    });

    // IMPORTANTE:
    // Si esta operación ya fue aplicada previamente, la idempotencia
    // debe ganar sobre el estado actual de la requisición.
    //
    // Ejemplo:
    // recepción aplicada -> requisición COMPLETADA -> cliente reintenta POST
    // Debe devolver repeated=true y NO RECHAZAR por COMPLETADA.
    if (receipt.estado === 'APLICADA') {
      return {
        repeated: true,
        receiptId: receipt.id,
        requisicionId: receipt.requisicionId,
        estado: receipt.estado,
      };
    }

    try {
      const requisition = await this.repository.findById(command.requisicionId);

      if (!requisition) {
        throw new RequisitionNotFoundError(command.requisicionId);
      }

      // Para recepciones NUEVAS, PENDIENTES o FALLIDAS
      // sí aplican nuevamente las reglas de negocio.
      requisition.assertReceivable();

      await requireActiveWarehouse(this.bodegas, requisition.bodegaDestinoId);

      await requireProvider(this.catalog, requisition.proveedorId!);

      for (const line of receipt.detalles) {
        await this.inventory.registerReceipt({
          bodegaId: receipt.bodegaDestinoId,
          productoId: line.productoId,
          cantidad: line.cantidad,
          costoUnitario: line.costoUnitario,
          proveedorId: receipt.proveedorId,
          reference: {
            type: 'RECEPCION_REQUISICION',
            id: line.id,
          },
          observaciones: command.observaciones ?? null,
          claveIdempotencia:
            `REQUISICION:${receipt.requisicionId}` +
            `:RECEPCION:${receipt.id}` +
            `:DETALLE:${line.id}`,
          actorId: command.actorId,
        });
      }

      await this.repository.finalizeReceipt(receipt.id, command.actorId);

      return {
        repeated: receipt.repeated,
        receiptId: receipt.id,
        requisicionId: receipt.requisicionId,
        estado: 'APLICADA',
      };
    } catch (error) {
      await this.repository.markReceiptFailed(
        receipt.id,
        error instanceof Error
          ? error.message
          : 'Error desconocido al aplicar inventario.',
      );

      throw error;
    }
  }
}
