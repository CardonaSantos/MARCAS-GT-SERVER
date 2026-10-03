export class PaymentDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class PaymentNotFoundError extends PaymentDomainError {
  constructor(id?: number) {
    super(
      'PAYMENT_NOT_FOUND',
      id ? `El pago #${id} no existe.` : 'El recurso de pagos no existe.',
      id ? { id } : undefined,
    );
  }
}

export class PaymentForbiddenError extends PaymentDomainError {
  constructor(message = 'No tienes permisos para realizar esta operación.') {
    super('PAYMENT_FORBIDDEN', message);
  }
}

export class PaymentValidationError extends PaymentDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PAYMENT_VALIDATION_ERROR', message, details);
  }
}

export class PaymentInvalidStateError extends PaymentDomainError {
  constructor(state: string, operation: string) {
    super(
      'PAYMENT_INVALID_STATE',
      `No se puede ${operation} un pago en estado ${state}.`,
      { state, operation },
    );
  }
}

export class PaymentIdempotencyConflictError extends PaymentDomainError {
  constructor(details?: Record<string, unknown>) {
    super(
      'PAYMENT_IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue utilizada para otra operación.',
      details,
    );
  }
}

export class PaymentAvailableAmountExceededError extends PaymentDomainError {
  constructor(details?: Record<string, unknown>) {
    super(
      'PAYMENT_AVAILABLE_AMOUNT_EXCEEDED',
      'El monto solicitado excede el saldo disponible del pago.',
      details,
    );
  }
}

export class ReceivableBalanceExceededError extends PaymentDomainError {
  constructor(details?: Record<string, unknown>) {
    super(
      'RECEIVABLE_BALANCE_EXCEEDED',
      'El monto solicitado excede el saldo pendiente de la cuenta por cobrar.',
      details,
    );
  }
}

export class PaymentConcurrentModificationError extends PaymentDomainError {
  constructor(details?: Record<string, unknown>) {
    super(
      'PAYMENT_CONCURRENT_MODIFICATION',
      'El pago cambió mientras se procesaba la operación. Intenta nuevamente.',
      details,
    );
  }
}
