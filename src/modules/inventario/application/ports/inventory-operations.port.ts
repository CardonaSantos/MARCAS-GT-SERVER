import {
  CancelReservationCommand,
  InventoryMutationResult,
  RegisterEntryCommand,
  RegisterReturnCommand,
  RegisterTransferCommand,
  ReservationMutationCommand,
  ReserveInventoryCommand,
} from '../models/inventory.models';

export interface InventoryOperationsPort {
  registerReceipt(command: RegisterEntryCommand): Promise<InventoryMutationResult>;
  reserve(command: ReserveInventoryCommand): Promise<InventoryMutationResult>;
  applyReservation(command: ReservationMutationCommand): Promise<InventoryMutationResult>;
  releaseReservation(command: ReservationMutationCommand): Promise<InventoryMutationResult>;
  cancelReservation(command: CancelReservationCommand): Promise<InventoryMutationResult>;
  registerReturn(command: RegisterReturnCommand): Promise<InventoryMutationResult>;
  registerTransferOut(command: RegisterTransferCommand): Promise<InventoryMutationResult>;
  registerTransferIn(command: RegisterTransferCommand): Promise<InventoryMutationResult>;
}
