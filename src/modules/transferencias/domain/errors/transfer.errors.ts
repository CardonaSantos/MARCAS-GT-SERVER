export class TransferError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class TransferNotFoundError extends TransferError {
  constructor(id: number) {
    super('TRANSFER_NOT_FOUND', 'La transferencia no existe.', { id });
  }
}

export class TransferInvalidStateError extends TransferError {
  constructor(current: string, operation: string) {
    super(
      'TRANSFER_INVALID_STATE',
      'La transferencia no se encuentra en un estado válido para esta operación.',
      { current, operation },
    );
  }
}

export class TransferValidationError extends TransferError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TRANSFER_VALIDATION_ERROR', message, details);
  }
}

export class TransferConcurrentModificationError extends TransferError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSFER_CONCURRENT_MODIFICATION',
      'La transferencia fue modificada por otra operación. Intenta nuevamente.',
      details,
    );
  }
}

export class TransferOperationConflictError extends TransferError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSFER_OPERATION_CONFLICT',
      'Existe una operación de transferencia pendiente o incompatible.',
      details,
    );
  }
}

export class TransferIdempotencyConflictError extends TransferError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSFER_IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue utilizada con una operación diferente.',
      details,
    );
  }
}

export class TransferInsufficientAvailabilityError extends TransferError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSFER_INSUFFICIENT_AVAILABILITY',
      'La bodega origen no tiene disponibilidad suficiente para preparar la transferencia.',
      details,
    );
  }
}

export class TransferInventoryOperationFailedError extends TransferError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TRANSFER_INVENTORY_OPERATION_FAILED', message, details);
  }
}

export class TransferInventoryContractError extends TransferError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSFER_INVENTORY_CONTRACT_ERROR',
      'Inventario no devolvió la información histórica requerida para la transferencia.',
      details,
    );
  }
}
