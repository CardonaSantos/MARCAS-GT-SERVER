import { RequisitionQueryPort } from '../ports/requisition-query.port';
export class GetRequisitionSummaryUseCase {
  constructor(private readonly query: RequisitionQueryPort) {}
  execute(filters?: { bodegaDestinoId?: number; proveedorId?: number; fechaDesde?: Date; fechaHasta?: Date }) {
    return this.query.getSummary(filters);
  }
}
