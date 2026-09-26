import { InventoryStockNotFoundError } from '../../domain/errors/inventory.errors';
import { InventoryQueryPort } from '../ports/inventory-query.port';

export class GetInventoryStockUseCase {
  constructor(private readonly query: InventoryQueryPort) {}
  async execute(stockId: number) {
    const value = await this.query.getStockDetail(stockId);
    if (!value) throw new InventoryStockNotFoundError({ stockId });
    return value;
  }
}
