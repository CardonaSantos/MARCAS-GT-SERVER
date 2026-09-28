import {
  ReceiptListFilters,
  ReceiptPage,
  RequisitionDetailView,
  RequisitionEventFilters,
  RequisitionEventPage,
  RequisitionListFilters,
  RequisitionPage,
  RequisitionSummaryView,
} from '../models/requisition.models';

export interface RequisitionQueryPort {
  list(filters: RequisitionListFilters): Promise<RequisitionPage>;
  getById(id: number): Promise<RequisitionDetailView | null>;
  listEvents(id: number, filters: RequisitionEventFilters): Promise<RequisitionEventPage>;
  listReceipts(filters: ReceiptListFilters): Promise<ReceiptPage>;
  getSummary(filters?: {
    bodegaDestinoId?: number;
    proveedorId?: number;
    fechaDesde?: Date;
    fechaHasta?: Date;
  }): Promise<RequisitionSummaryView>;
}
