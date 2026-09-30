import { TransferSummaryFilters } from '../models/transfer.models';
import { TransferQueryPort } from '../ports/transfer-query.port';

export class GetTransferSummaryUseCase {
  constructor(private readonly query: TransferQueryPort) {}

  execute(filters?: TransferSummaryFilters) {
    return this.query.getSummary(filters);
  }
}
