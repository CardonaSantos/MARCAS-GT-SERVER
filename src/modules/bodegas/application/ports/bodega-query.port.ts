import {
  BodegaDetailView,
  BodegaEventFilters,
  BodegaEventView,
  BodegaListFilters,
  BodegaListItemView,
  BodegaOverviewView,
  BodegaSelectableView,
  BodegaSelectQuery,
  PageResult,
} from '../models/bodega.models';

export interface BodegaQueryPort {
  list(filters: BodegaListFilters): Promise<PageResult<BodegaListItemView>>;
  getById(id: number): Promise<BodegaDetailView | null>;
  getPrincipal(): Promise<BodegaDetailView | null>;
  listSelectables(query: BodegaSelectQuery): Promise<BodegaSelectableView[]>;
  listEvents(
    bodegaId: number,
    filters: BodegaEventFilters,
  ): Promise<PageResult<BodegaEventView>>;
  getOverview(): Promise<BodegaOverviewView>;
}
