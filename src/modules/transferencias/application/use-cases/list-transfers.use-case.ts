import { TransferListFilters } from '../models/transfer.models';
import { TransferQueryPort } from '../ports/transfer-query.port';

export class ListTransfersUseCase {
  constructor(private readonly query: TransferQueryPort) {}

  execute(filters: TransferListFilters) {
    return this.query.list(filters);
  }
}
