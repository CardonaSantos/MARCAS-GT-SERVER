import { TransferActorEntry } from '../../transfer.types';

export interface TransferActorDirectoryPort {
  findById(id: number): Promise<TransferActorEntry | null>;
}
