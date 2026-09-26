export type InventoryErrorCode =
  | 'INVENTORY_STOCK_NOT_FOUND'
  | 'INVENTORY_PRODUCT_NOT_FOUND'
  | 'INVENTORY_BODEGA_NOT_FOUND'
  | 'INVENTORY_BODEGA_INACTIVE'
  | 'INVENTORY_INVALID_QUANTITY'
  | 'INVENTORY_INVALID_COST'
  | 'INVENTORY_INSUFFICIENT_AVAILABLE_STOCK'
  | 'INVENTORY_INSUFFICIENT_RESERVED_STOCK'
  | 'INVENTORY_RESERVATION_NOT_FOUND'
  | 'INVENTORY_RESERVATION_CLOSED'
  | 'INVENTORY_RESERVATION_QUANTITY_EXCEEDED'
  | 'INVENTORY_ORDER_DETAIL_NOT_FOUND'
  | 'INVENTORY_ORDER_DETAIL_CAPACITY_EXCEEDED'
  | 'INVENTORY_CONCURRENT_MODIFICATION'
  | 'INVENTORY_INVALID_ADJUSTMENT_REASON'
  | 'INVENTORY_INVALID_REFERENCE';

export class InventoryError extends Error {
  constructor(
    public readonly code: InventoryErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InventoryStockNotFoundError extends InventoryError {
  constructor(details?: Record<string, unknown>) {
    super('INVENTORY_STOCK_NOT_FOUND', 'No se encontró el registro de inventario.', details);
  }
}

export class InventoryProductNotFoundError extends InventoryError {
  constructor(productoId: number) {
    super('INVENTORY_PRODUCT_NOT_FOUND', 'El producto indicado no existe.', { productoId });
  }
}

export class InventoryBodegaNotFoundError extends InventoryError {
  constructor(bodegaId: number) {
    super('INVENTORY_BODEGA_NOT_FOUND', 'La bodega indicada no existe.', { bodegaId });
  }
}

export class InventoryBodegaInactiveError extends InventoryError {
  constructor(bodegaId: number) {
    super('INVENTORY_BODEGA_INACTIVE', 'La bodega está inactiva y no puede operar inventario.', { bodegaId });
  }
}

export class InvalidInventoryQuantityError extends InventoryError {
  constructor(quantity: unknown) {
    super('INVENTORY_INVALID_QUANTITY', 'La cantidad debe ser un entero mayor que cero.', { quantity });
  }
}

export class InvalidInventoryCostError extends InventoryError {
  constructor(cost: unknown) {
    super('INVENTORY_INVALID_COST', 'El costo debe ser un valor no negativo con máximo cuatro decimales.', { cost });
  }
}

export class InsufficientAvailableStockError extends InventoryError {
  constructor(available: number, requested: number) {
    super('INVENTORY_INSUFFICIENT_AVAILABLE_STOCK', 'No existe inventario disponible suficiente para realizar la operación.', {
      available,
      requested,
    });
  }
}

export class InsufficientReservedStockError extends InventoryError {
  constructor(reserved: number, requested: number) {
    super('INVENTORY_INSUFFICIENT_RESERVED_STOCK', 'La cantidad reservada es insuficiente para realizar la operación.', {
      reserved,
      requested,
    });
  }
}

export class InventoryReservationNotFoundError extends InventoryError {
  constructor(reservationId: number) {
    super('INVENTORY_RESERVATION_NOT_FOUND', 'No se encontró la reserva de inventario.', { reservationId });
  }
}

export class InventoryReservationClosedError extends InventoryError {
  constructor(reservationId?: number) {
    super('INVENTORY_RESERVATION_CLOSED', 'La reserva ya está cerrada y no admite nuevas operaciones.', { reservationId });
  }
}

export class InventoryReservationQuantityExceededError extends InventoryError {
  constructor(pending: number, requested: number) {
    super('INVENTORY_RESERVATION_QUANTITY_EXCEEDED', 'La operación excede la cantidad pendiente de la reserva.', {
      pending,
      requested,
    });
  }
}

export class InventoryOrderDetailNotFoundError extends InventoryError {
  constructor(pedidoDetalleId: number) {
    super('INVENTORY_ORDER_DETAIL_NOT_FOUND', 'No se encontró el detalle de pedido asociado a la reserva.', {
      pedidoDetalleId,
    });
  }
}

export class InventoryOrderDetailCapacityExceededError extends InventoryError {
  constructor(availableToReserve: number, requested: number) {
    super('INVENTORY_ORDER_DETAIL_CAPACITY_EXCEEDED', 'La reserva supera la cantidad pendiente del detalle de pedido.', {
      availableToReserve,
      requested,
    });
  }
}

export class InventoryConcurrentModificationError extends InventoryError {
  constructor(details?: Record<string, unknown>) {
    super('INVENTORY_CONCURRENT_MODIFICATION', 'El inventario cambió mientras se procesaba la operación. Intenta nuevamente.', details);
  }
}

export class InvalidInventoryAdjustmentReasonError extends InventoryError {
  constructor() {
    super('INVENTORY_INVALID_ADJUSTMENT_REASON', 'Los ajustes manuales requieren un motivo válido.');
  }
}

export class InvalidInventoryReferenceError extends InventoryError {
  constructor() {
    super('INVENTORY_INVALID_REFERENCE', 'El tipo y el id de referencia deben enviarse juntos.');
  }
}
