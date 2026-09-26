import { Inject, Injectable } from '@nestjs/common';
import { InventoryAvailabilityPort } from '../../application/ports/inventory-availability.port';
import { InventoryQueryPort } from '../../application/ports/inventory-query.port';
import { INVENTORY_QUERY } from '../../inventory.tokens';

@Injectable()
export class InventoryAvailabilityAdapter
  implements InventoryAvailabilityPort
{
  constructor(
    @Inject(INVENTORY_QUERY)
    private readonly query: InventoryQueryPort,
  ) {}

  getProductAvailability(productoId: number) {
    return this.query.getProductAvailability(productoId);
  }

  hasAvailability(
    bodegaId: number,
    productoId: number,
    cantidad: number,
  ) {
    return this.query.hasAvailability(bodegaId, productoId, cantidad);
  }
}
