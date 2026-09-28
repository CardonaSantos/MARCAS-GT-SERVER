import { RequisitionListFilters } from '../models/requisition.models';
import { RequisitionQueryPort } from '../ports/requisition-query.port';
export class ListRequisitionsUseCase {
  constructor(private readonly query: RequisitionQueryPort) {}
  execute(filters: RequisitionListFilters) { return this.query.list(filters); }
}
