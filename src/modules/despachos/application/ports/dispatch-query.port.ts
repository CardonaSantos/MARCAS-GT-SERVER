import {
  DispatchCandidateFilters,
  DispatchCandidatePage,
  DispatchDetailView,
  DispatchEventFilters,
  DispatchEventPage,
  DispatchListFilters,
  DispatchOperationFilters,
  DispatchOperationPage,
  DispatchOperationalReportFilters,
  DispatchOperationalReportView,
  DispatchPage,
  DispatchSummaryFilters,
  DispatchSummaryView,
} from '../models/dispatch.models';

export interface DispatchQueryPort {
  listCandidates(filters: DispatchCandidateFilters): Promise<DispatchCandidatePage>;
  list(filters: DispatchListFilters): Promise<DispatchPage>;
  getById(
    id: number,
    scope: { empresaId: number; vendedorId?: number; rol: string },
  ): Promise<DispatchDetailView | null>;
  listEvents(id: number, filters: DispatchEventFilters): Promise<DispatchEventPage>;
  listOperations(filters: DispatchOperationFilters): Promise<DispatchOperationPage>;
  getSummary(filters: DispatchSummaryFilters): Promise<DispatchSummaryView>;
  getOperationalReport(
    filters: DispatchOperationalReportFilters,
  ): Promise<DispatchOperationalReportView>;
}
