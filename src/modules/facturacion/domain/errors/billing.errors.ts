export class BillingDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BillingNotFoundError extends BillingDomainError {
  constructor(id: number) {
    super('BILLING_NOT_FOUND', 'Factura no encontrada.', { facturaId: id });
  }
}

export class BillingForbiddenError extends BillingDomainError {
  constructor(message = 'No tienes permisos para operar esta factura.') {
    super('BILLING_FORBIDDEN', message);
  }
}

export class BillingValidationError extends BillingDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('BILLING_VALIDATION_ERROR', message, details);
  }
}

export class BillingInvalidStateError extends BillingDomainError {
  constructor(state: string, action: string) {
    super(
      'BILLING_INVALID_STATE',
      `No se puede ${action} cuando la factura está en estado ${state}.`,
      { state, action },
    );
  }
}

export class BillingDeliveryNotBillableError extends BillingDomainError {
  constructor(entregaId: number) {
    super(
      'BILLING_DELIVERY_NOT_BILLABLE',
      'La entrega no está disponible para facturación.',
      { entregaId },
    );
  }
}

export class BillingMixedContextError extends BillingDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('BILLING_MIXED_CONTEXT', message, details);
  }
}

export class BillableQuantityExceededError extends BillingDomainError {
  constructor(details: Record<string, unknown>) {
    super(
      'BILLABLE_QUANTITY_EXCEEDED',
      'La cantidad solicitada supera la cantidad disponible para facturar.',
      details,
    );
  }
}

export class BillingIdempotencyConflictError extends BillingDomainError {
  constructor(details?: Record<string, unknown>) {
    super(
      'BILLING_IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya pertenece a otra operación.',
      details,
    );
  }
}

export class BillingConcurrentModificationError extends BillingDomainError {
  constructor(details?: Record<string, unknown>) {
    super(
      'BILLING_CONCURRENT_MODIFICATION',
      'La factura fue modificada por otra operación.',
      details,
    );
  }
}

export class FiscalConfigurationError extends BillingDomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
  }
}

export class FelIntegrationPendingError extends BillingDomainError {
  constructor(details?: Record<string, unknown>) {
    super(
      'FEL_INTEGRATION_PENDING',
      'La integración con el certificador FEL todavía no está habilitada.',
      details,
    );
  }
}
