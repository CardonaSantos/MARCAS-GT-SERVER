import { TransferOperationFilters } from '../models/transfer.models';
import { TransferQueryPort } from '../ports/transfer-query.port';

export class ListTransferOperationsUseCase {
  constructor(private readonly query: TransferQueryPort) {}

  execute(filters: TransferOperationFilters) {
    return this.query.listOperations(filters);
  }
}
