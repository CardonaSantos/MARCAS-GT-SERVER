import { TransferEventFilters } from '../models/transfer.models';
import { TransferQueryPort } from '../ports/transfer-query.port';

export class ListTransferEventsUseCase {
  constructor(private readonly query: TransferQueryPort) {}

  execute(id: number, filters: TransferEventFilters) {
    return this.query.listEvents(id, filters);
  }
}
