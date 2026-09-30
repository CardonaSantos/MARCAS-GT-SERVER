import { InventoryReservationFilters } from '../models/inventory.models';
import { InventoryQueryPort } from '../ports/inventory-query.port';

export class ListInventoryReservationsUseCase {
  constructor(private readonly query: InventoryQueryPort) {}
  execute(filters: InventoryReservationFilters) {
    return this.query.listReservations(filters);
  }
}
