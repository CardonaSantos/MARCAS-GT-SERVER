import { RequisitionEventFilters } from '../models/requisition.models';
import { RequisitionQueryPort } from '../ports/requisition-query.port';
export class ListRequisitionEventsUseCase {
  constructor(private readonly query: RequisitionQueryPort) {}
  execute(id: number, filters: RequisitionEventFilters) { return this.query.listEvents(id, filters); }
}
