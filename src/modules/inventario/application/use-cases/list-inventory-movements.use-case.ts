import { InventoryMovementFilters } from '../models/inventory.models';
import { InventoryQueryPort } from '../ports/inventory-query.port';

export class ListInventoryMovementsUseCase {
  constructor(private readonly query: InventoryQueryPort) {}
  execute(filters: InventoryMovementFilters) {
    return this.query.listMovements(filters);
  }
}
