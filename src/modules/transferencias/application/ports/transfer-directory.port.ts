import { TransferDirectoryEntry } from '../models/transfer.models';

export interface TransferDirectoryPort {
  findById(id: number): Promise<TransferDirectoryEntry | null>;
}
