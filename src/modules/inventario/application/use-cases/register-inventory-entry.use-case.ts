import { RegisterEntryCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';

export class RegisterInventoryEntryUseCase {
  constructor(private readonly coordinator: InventoryMutationCoordinator) {}

  execute(command: RegisterEntryCommand) {
    return this.coordinator.mutateStock({
      ...command,
      movementType: 'ENTRADA_RECEPCION',
      mutation: 'ENTRY',
      unitCost: command.costoUnitario,
    });
  }
}
