import { InventoryQueryPort } from '../ports/inventory-query.port';

export class GetInventorySummaryUseCase {
  constructor(private readonly query: InventoryQueryPort) {}
  execute(bodegaId?: number) {
    return this.query.getSummary(bodegaId);
  }
}
