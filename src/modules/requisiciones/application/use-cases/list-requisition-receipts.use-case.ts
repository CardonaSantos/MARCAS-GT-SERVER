import { ReceiptListFilters } from '../models/requisition.models';
import { RequisitionQueryPort } from '../ports/requisition-query.port';
export class ListRequisitionReceiptsUseCase {
  constructor(private readonly query: RequisitionQueryPort) {}
  execute(filters: ReceiptListFilters) { return this.query.listReceipts(filters); }
}
