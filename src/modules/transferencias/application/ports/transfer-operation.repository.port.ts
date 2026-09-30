import {
  TransferOperationState,
  TransferOperationType,
  TransferState,
} from '../../transfer.types';

export type PrepareTransferReceiptLine = Readonly<{
  transferenciaDetalleId: number;
  cantidad: number;
}>;

export type PrepareTransferOperationCommand = Readonly<{
  transferenciaId: number;
  usuarioId: number;
  tipo: TransferOperationType;
  claveIdempotencia: string;
  documentoReferencia?: string | null;
  observaciones?: string | null;
  ocurridaEn?: Date | null;
  detalles?: PrepareTransferReceiptLine[];
}>;

export type PreparedTransferOperationLine = Readonly<{
  id: number;
  transferenciaDetalleId: number;
  productoId: number;
  cantidad: number;
  costoUnitario: string | null;
}>;

export type PreparedTransferOperation = Readonly<{
  id: number;
  transferenciaId: number;
  usuarioId: number;
  bodegaOrigenId: number;
  bodegaDestinoId: number;
  estadoTransferencia: TransferState;
  tipo: TransferOperationType;
  estado: TransferOperationState;
  claveIdempotencia: string;
  documentoReferencia: string | null;
  observaciones: string | null;
  ocurridaEn: Date;
  repeated: boolean;
  detalles: PreparedTransferOperationLine[];
}>;

export type RegisterTransferOperationLineResultCommand = Readonly<{
  operacionDetalleId: number;
  costoUnitario: string;
}>;

export type FinalizeTransferOperationResult = Readonly<{
  operacionId: number;
  transferenciaId: number;
  estadoOperacion: 'APLICADA';
  estadoTransferencia: TransferState;
}>;

export interface TransferOperationRepositoryPort {
  hasUnresolvedOperations(transferenciaId: number): Promise<boolean>;

  prepareOperation(
    command: PrepareTransferOperationCommand,
  ): Promise<PreparedTransferOperation>;

  registerLineResult(
    command: RegisterTransferOperationLineResultCommand,
  ): Promise<void>;

  markOperationFailed(operationId: number, error: string): Promise<void>;

  finalizeOperation(
    operationId: number,
    actorId: number,
  ): Promise<FinalizeTransferOperationResult>;
}
