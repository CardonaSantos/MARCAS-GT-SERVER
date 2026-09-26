import { InventoryListFilters } from '../models/inventory.models';
import { InventoryQueryPort } from '../ports/inventory-query.port';

export class ListInventoryUseCase {
  constructor(private readonly query: InventoryQueryPort) {}
  execute(filters: InventoryListFilters) {
    return this.query.list(filters);
  }
}
