import {
  InventoryListFilters,
  InventoryMovementFilters,
  InventoryMovementPage,
  InventoryPage,
  InventoryReservationFilters,
  InventoryReservationPage,
  InventoryReservationView,
  InventoryStockDetailView,
  InventorySummaryView,
  ProductAvailabilityView,
} from '../models/inventory.models';

export interface InventoryQueryPort {
  list(filters: InventoryListFilters): Promise<InventoryPage>;
  getStockDetail(stockId: number): Promise<InventoryStockDetailView | null>;
  getSummary(bodegaId?: number): Promise<InventorySummaryView>;
  getProductAvailability(productoId: number): Promise<ProductAvailabilityView | null>;
  hasAvailability(bodegaId: number, productoId: number, cantidad: number): Promise<boolean>;
  listMovements(filters: InventoryMovementFilters): Promise<InventoryMovementPage>;
  listReservations(filters: InventoryReservationFilters): Promise<InventoryReservationPage>;
  getReservation(id: number): Promise<InventoryReservationView | null>;
}
