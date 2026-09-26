import { AdjustInventoryCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';

export class AdjustInventoryUseCase {
  constructor(private readonly coordinator: InventoryMutationCoordinator) {}

  execute(command: AdjustInventoryCommand) {
    return this.coordinator.mutateStock({
      bodegaId: command.bodegaId,
      productoId: command.productoId,
      cantidad: command.cantidad,
      movementType:
        command.tipo === 'ENTRADA' ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
      mutation: command.tipo === 'ENTRADA' ? 'ENTRY' : 'AVAILABLE_EXIT',
      unitCost: command.costoUnitario,
      observaciones: command.motivo,
      claveIdempotencia: command.claveIdempotencia,
      actorId: command.actorId,
      requireReason: true,
    });
  }
}
