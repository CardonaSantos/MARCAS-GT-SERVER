import { InventoryProductNotFoundError } from '../../domain/errors/inventory.errors';
import { InventoryQueryPort } from '../ports/inventory-query.port';

export class GetProductAvailabilityUseCase {
  constructor(private readonly query: InventoryQueryPort) {}
  async execute(productoId: number) {
    const value = await this.query.getProductAvailability(productoId);
    if (!value) throw new InventoryProductNotFoundError(productoId);
    return value;
  }
}
