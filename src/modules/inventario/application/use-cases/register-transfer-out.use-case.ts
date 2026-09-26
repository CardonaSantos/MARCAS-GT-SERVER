import { RegisterTransferCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';

export class RegisterTransferOutUseCase {
  constructor(private readonly coordinator: InventoryMutationCoordinator) {}

  execute(command: RegisterTransferCommand) {
    return this.coordinator.mutateStock({
      bodegaId: command.bodegaId,
      productoId: command.productoId,
      cantidad: command.cantidad,
      movementType: 'TRANSFERENCIA_SALIDA',
      mutation: 'AVAILABLE_EXIT',
      reference: { type: 'TRANSFERENCIA', id: command.transferenciaId },
      observaciones: command.observaciones,
      claveIdempotencia: command.claveIdempotencia,
      actorId: command.actorId,
    });
  }
}
