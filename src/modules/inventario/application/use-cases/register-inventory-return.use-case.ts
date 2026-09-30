import { RegisterReturnCommand } from '../models/inventory.models';
import { InventoryMutationCoordinator } from './inventory-mutation.coordinator';

export class RegisterInventoryReturnUseCase {
  constructor(private readonly coordinator: InventoryMutationCoordinator) {}

  execute(command: RegisterReturnCommand) {
    return this.coordinator.mutateStock({
      ...command,
      movementType: 'DEVOLUCION',
      mutation: 'ENTRY',
      unitCost: command.costoUnitario,
    });
  }
}
