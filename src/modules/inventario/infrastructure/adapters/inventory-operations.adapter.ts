import { Injectable } from '@nestjs/common';
import {
  CancelReservationCommand,
  RegisterEntryCommand,
  RegisterReturnCommand,
  RegisterTransferCommand,
  ReservationMutationCommand,
  ReserveInventoryCommand,
} from '../../application/models/inventory.models';
import { InventoryOperationsPort } from '../../application/ports/inventory-operations.port';
import { ApplyInventoryReservationUseCase } from '../../application/use-cases/apply-inventory-reservation.use-case';
import { CancelInventoryReservationUseCase } from '../../application/use-cases/cancel-inventory-reservation.use-case';
import { RegisterInventoryEntryUseCase } from '../../application/use-cases/register-inventory-entry.use-case';
import { RegisterInventoryReturnUseCase } from '../../application/use-cases/register-inventory-return.use-case';
import { RegisterTransferInUseCase } from '../../application/use-cases/register-transfer-in.use-case';
import { RegisterTransferOutUseCase } from '../../application/use-cases/register-transfer-out.use-case';
import { ReleaseInventoryReservationUseCase } from '../../application/use-cases/release-inventory-reservation.use-case';
import { ReserveInventoryUseCase } from '../../application/use-cases/reserve-inventory.use-case';

@Injectable()
export class InventoryOperationsAdapter implements InventoryOperationsPort {
  constructor(
    private readonly registerEntry: RegisterInventoryEntryUseCase,
    private readonly reserveInventory: ReserveInventoryUseCase,
    private readonly applyInventoryReservation: ApplyInventoryReservationUseCase,
    private readonly releaseInventoryReservation: ReleaseInventoryReservationUseCase,
    private readonly cancelInventoryReservation: CancelInventoryReservationUseCase,
    private readonly registerInventoryReturn: RegisterInventoryReturnUseCase,
    private readonly registerTransferOutUseCase: RegisterTransferOutUseCase,
    private readonly registerTransferInUseCase: RegisterTransferInUseCase,
  ) {}

  registerReceipt(command: RegisterEntryCommand) {
    return this.registerEntry.execute(command);
  }

  reserve(command: ReserveInventoryCommand) {
    return this.reserveInventory.execute(command);
  }

  applyReservation(command: ReservationMutationCommand) {
    return this.applyInventoryReservation.execute(command);
  }

  releaseReservation(command: ReservationMutationCommand) {
    return this.releaseInventoryReservation.execute(command);
  }

  cancelReservation(command: CancelReservationCommand) {
    return this.cancelInventoryReservation.execute(command);
  }

  registerReturn(command: RegisterReturnCommand) {
    return this.registerInventoryReturn.execute(command);
  }

  registerTransferOut(command: RegisterTransferCommand) {
    return this.registerTransferOutUseCase.execute(command);
  }

  registerTransferIn(command: RegisterTransferCommand) {
    return this.registerTransferInUseCase.execute(command);
  }
}
