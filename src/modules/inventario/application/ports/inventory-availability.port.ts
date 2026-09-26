import { ProductAvailabilityView } from '../models/inventory.models';

export interface InventoryAvailabilityPort {
  getProductAvailability(productoId: number): Promise<ProductAvailabilityView | null>;
  hasAvailability(bodegaId: number, productoId: number, cantidad: number): Promise<boolean>;
}
