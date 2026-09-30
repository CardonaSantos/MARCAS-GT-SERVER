export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class OrderNotFoundError extends OrderError {
  constructor(id: number) {
    super('ORDER_NOT_FOUND', 'El pedido no existe.', { id });
  }
}

export class OrderValidationError extends OrderError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ORDER_VALIDATION_ERROR', message, details);
  }
}

export class OrderInvalidStateError extends OrderError {
  constructor(current: string, operation: string) {
    super(
      'ORDER_INVALID_STATE',
      'El pedido no se encuentra en un estado válido para esta operación.',
      { current, operation },
    );
  }
}

export class OrderConcurrentModificationError extends OrderError {
  constructor(details?: Record<string, unknown>) {
    super(
      'ORDER_CONCURRENT_MODIFICATION',
      'El pedido fue modificado por otra operación. Intenta nuevamente.',
      details,
    );
  }
}

export class OrderActorNotFoundError extends OrderError {
  constructor(actorId: number) {
    super('ORDER_ACTOR_NOT_FOUND', 'El usuario no existe o está inactivo.', { actorId });
  }
}

export class OrderCompanyRequiredError extends OrderError {
  constructor(actorId: number) {
    super(
      'ORDER_COMPANY_REQUIRED',
      'El usuario debe pertenecer a una empresa para operar pedidos.',
      { actorId },
    );
  }
}

export class OrderForbiddenError extends OrderError {
  constructor(message = 'No tienes permisos para operar este pedido.') {
    super('ORDER_FORBIDDEN', message);
  }
}

export class OrderCustomerNotFoundError extends OrderError {
  constructor(clienteId: number) {
    super('ORDER_CUSTOMER_NOT_FOUND', 'El cliente no existe.', { clienteId });
  }
}

export class OrderVisitNotFoundError extends OrderError {
  constructor(visitaId: number) {
    super('ORDER_VISIT_NOT_FOUND', 'La visita no existe.', { visitaId });
  }
}

export class OrderVisitMismatchError extends OrderError {
  constructor(details?: Record<string, unknown>) {
    super(
      'ORDER_VISIT_MISMATCH',
      'La visita no corresponde con el cliente o vendedor del pedido.',
      details,
    );
  }
}

export class OrderProductNotFoundError extends OrderError {
  constructor(productoId: number) {
    super('ORDER_PRODUCT_NOT_FOUND', 'El producto no existe.', { productoId });
  }
}

export class OrderSellerInvalidError extends OrderError {
  constructor(vendedorId: number) {
    super(
      'ORDER_SELLER_INVALID',
      'El vendedor indicado no existe, está inactivo o no pertenece a la empresa.',
      { vendedorId },
    );
  }
}

export class OrderCreditApprovalRequiredError extends OrderError {
  constructor(condition: string) {
    super(
      'ORDER_CREDIT_APPROVAL_REQUIRED',
      'El pedido requiere aprobación de crédito antes de confirmarse.',
      { condicionPago: condition },
    );
  }
}
