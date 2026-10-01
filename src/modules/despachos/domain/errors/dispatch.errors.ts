export class DispatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class DispatchNotFoundError extends DispatchError {
  constructor(id: number) {
    super('DISPATCH_NOT_FOUND', 'La orden de despacho no existe.', { id });
  }
}

export class DispatchValidationError extends DispatchError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('DISPATCH_VALIDATION_ERROR', message, details);
  }
}

export class DispatchInvalidStateError extends DispatchError {
  constructor(current: string, operation: string) {
    super(
      'DISPATCH_INVALID_STATE',
      'La orden de despacho no se encuentra en un estado válido para esta operación.',
      { current, operation },
    );
  }
}

export class DispatchConcurrentModificationError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_CONCURRENT_MODIFICATION',
      'El despacho fue modificado por otra operación. Intenta nuevamente.',
      details,
    );
  }
}

export class DispatchActorNotFoundError extends DispatchError {
  constructor(actorId: number) {
    super('DISPATCH_ACTOR_NOT_FOUND', 'El usuario no existe o está inactivo.', { actorId });
  }
}

export class DispatchCompanyRequiredError extends DispatchError {
  constructor(actorId: number) {
    super(
      'DISPATCH_COMPANY_REQUIRED',
      'El usuario debe pertenecer a una empresa para operar despachos.',
      { actorId },
    );
  }
}

export class DispatchForbiddenError extends DispatchError {
  constructor(message = 'No tienes permisos para operar este despacho.') {
    super('DISPATCH_FORBIDDEN', message);
  }
}

export class DispatchOrderNotFoundError extends DispatchError {
  constructor(pedidoId: number) {
    super('DISPATCH_ORDER_NOT_FOUND', 'El pedido no existe.', { pedidoId });
  }
}

export class DispatchOrderNotEligibleError extends DispatchError {
  constructor(estado: string, details?: Record<string, unknown>) {
    super(
      'DISPATCH_ORDER_NOT_ELIGIBLE',
      'El pedido no está disponible para planificación o despacho.',
      { estado, ...details },
    );
  }
}

export class DispatchWarehouseNotFoundError extends DispatchError {
  constructor(bodegaId: number) {
    super('DISPATCH_WAREHOUSE_NOT_FOUND', 'La bodega no existe.', { bodegaId });
  }
}

export class DispatchWarehouseInactiveError extends DispatchError {
  constructor(bodegaId: number) {
    super('DISPATCH_WAREHOUSE_INACTIVE', 'La bodega no está activa para operaciones.', { bodegaId });
  }
}

export class DispatchWarehouseCompanyMismatchError extends DispatchError {
  constructor(bodegaId: number, empresaId: number) {
    super(
      'DISPATCH_WAREHOUSE_COMPANY_MISMATCH',
      'La bodega no pertenece a la empresa del pedido.',
      { bodegaId, empresaId },
    );
  }
}

export class DispatchQuantityExceededError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_QUANTITY_EXCEEDED',
      'La cantidad indicada excede la capacidad disponible.',
      details,
    );
  }
}

export class DispatchInsufficientAvailabilityError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_INSUFFICIENT_AVAILABILITY',
      'No existe inventario disponible suficiente para iniciar la preparación.',
      details,
    );
  }
}

export class DispatchOperationNotFoundError extends DispatchError {
  constructor(operationId: number) {
    super('DISPATCH_OPERATION_NOT_FOUND', 'La operación de despacho no existe.', { operationId });
  }
}

export class DispatchOperationConflictError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_OPERATION_CONFLICT',
      'La operación de despacho no coincide con el estado actual.',
      details,
    );
  }
}

export class DispatchIdempotencyConflictError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue utilizada por otra operación.',
      details,
    );
  }
}

export class DispatchInventoryOperationFailedError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_INVENTORY_OPERATION_FAILED',
      'No fue posible completar la operación requerida en Inventario.',
      details,
    );
  }
}

export class DispatchInventoryContractError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_INVENTORY_CONTRACT_ERROR',
      'Inventario devolvió una respuesta incompatible con Despachos.',
      details,
    );
  }
}

export class DispatchOrderIntegrationFailedError extends DispatchError {
  constructor(details?: Record<string, unknown>) {
    super(
      'DISPATCH_ORDER_INTEGRATION_FAILED',
      'Inventario fue actualizado, pero no fue posible sincronizar el pedido.',
      details,
    );
  }
}

export class DispatchOperationNotRetryableError extends DispatchError {
  constructor(operationId: number, estado: string) {
    super(
      'DISPATCH_OPERATION_NOT_RETRYABLE',
      'La operación no requiere o no permite reintento.',
      { operationId, estado },
    );
  }
}
