import {
  TransferDetailView,
  TransferEventFilters,
  TransferEventPage,
  TransferListFilters,
  TransferOperationFilters,
  TransferOperationPage,
  TransferPage,
  TransferSummaryFilters,
  TransferSummaryView,
} from '../models/transfer.models';

export interface TransferQueryPort {
  list(filters: TransferListFilters): Promise<TransferPage>;
  getById(id: number): Promise<TransferDetailView | null>;
  listEvents(
    id: number,
    filters: TransferEventFilters,
  ): Promise<TransferEventPage>;
  listOperations(
    filters: TransferOperationFilters,
  ): Promise<TransferOperationPage>;
  getSummary(
    filters?: TransferSummaryFilters,
  ): Promise<TransferSummaryView>;
}
