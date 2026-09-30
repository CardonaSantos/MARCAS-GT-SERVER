export class RequisitionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RequisitionError';
  }
}

export class RequisitionNotFoundError extends RequisitionError {
  constructor(id: number) {
    super('REQUISITION_NOT_FOUND', 'No se encontró la requisición.', { id });
  }
}

export class RequisitionInvalidStateError extends RequisitionError {
  constructor(current: string, operation: string) {
    super(
      'REQUISITION_INVALID_STATE',
      'La requisición no se encuentra en un estado válido para esta operación.',
      { current, operation },
    );
  }
}

export class RequisitionValidationError extends RequisitionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('REQUISITION_VALIDATION_ERROR', message, details);
  }
}

export class RequisitionConcurrentModificationError extends RequisitionError {
  constructor(details?: Record<string, unknown>) {
    super(
      'REQUISITION_CONCURRENT_MODIFICATION',
      'La requisición cambió mientras se procesaba la operación. Intenta nuevamente.',
      details,
    );
  }
}

export class RequisitionReceiptConflictError extends RequisitionError {
  constructor(details?: Record<string, unknown>) {
    super(
      'REQUISITION_RECEIPT_CONFLICT',
      'La recepción excede la cantidad pendiente o entra en conflicto con otra recepción.',
      details,
    );
  }
}

export class RequisitionIdempotencyConflictError extends RequisitionError {
  constructor(details?: Record<string, unknown>) {
    super(
      'REQUISITION_IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue utilizada para una recepción diferente.',
      details,
    );
  }
}
