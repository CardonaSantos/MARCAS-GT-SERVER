import { InventoryReservationNotFoundError } from '../../domain/errors/inventory.errors';
import { InventoryQueryPort } from '../ports/inventory-query.port';

export class GetInventoryReservationUseCase {
  constructor(private readonly query: InventoryQueryPort) {}
  async execute(id: number) {
    const value = await this.query.getReservation(id);
    if (!value) throw new InventoryReservationNotFoundError(id);
    return value;
  }
}
