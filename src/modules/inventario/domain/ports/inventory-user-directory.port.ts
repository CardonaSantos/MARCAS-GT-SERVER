import { InventoryUserEntry } from '../inventory.types';

export interface InventoryUserDirectoryPort {
  findById(id: number): Promise<InventoryUserEntry | null>;
}
