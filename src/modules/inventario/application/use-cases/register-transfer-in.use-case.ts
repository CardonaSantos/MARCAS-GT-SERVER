import { RegisterTransferCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';

export class RegisterTransferInUseCase {
  constructor(private readonly coordinator: InventoryMutationCoordinator) {}

  execute(command: RegisterTransferCommand) {
    return this.coordinator.mutateStock({
      bodegaId: command.bodegaId,
      productoId: command.productoId,
      cantidad: command.cantidad,
      movementType: 'TRANSFERENCIA_ENTRADA',
      mutation: 'ENTRY',
      unitCost: command.costoUnitario,
      reference: { type: 'TRANSFERENCIA', id: command.transferenciaId },
      observaciones: command.observaciones,
      claveIdempotencia: command.claveIdempotencia,
      actorId: command.actorId,
    });
  }
}
