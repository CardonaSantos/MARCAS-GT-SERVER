export class TransportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class TransportNotFoundError extends TransportError {
  constructor(id: number) {
    super('TRANSPORT_NOT_FOUND', 'El envío no existe.', { id });
  }
}
export class TransportValidationError extends TransportError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TRANSPORT_VALIDATION_ERROR', message, details);
  }
}
export class TransportInvalidStateError extends TransportError {
  constructor(current: string, operation: string) {
    super(
      'TRANSPORT_INVALID_STATE',
      'El envío no se encuentra en un estado válido para esta operación.',
      { current, operation },
    );
  }
}
export class TransportForbiddenError extends TransportError {
  constructor(
    message = 'No tienes permisos para realizar esta operación de transporte.',
  ) {
    super('TRANSPORT_FORBIDDEN', message);
  }
}
export class TransportActorNotFoundError extends TransportError {
  constructor(actorId: number) {
    super(
      'TRANSPORT_ACTOR_NOT_FOUND',
      'El usuario no existe o está inactivo.',
      { actorId },
    );
  }
}
export class TransportCompanyRequiredError extends TransportError {
  constructor(actorId: number) {
    super(
      'TRANSPORT_COMPANY_REQUIRED',
      'El usuario debe pertenecer a una empresa para operar Transporte.',
      { actorId },
    );
  }
}
export class TransportDispatchNotFoundError extends TransportError {
  constructor(dispatchId: number) {
    super('TRANSPORT_DISPATCH_NOT_FOUND', 'La orden de despacho no existe.', {
      dispatchId,
    });
  }
}
export class TransportDispatchNotEligibleError extends TransportError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TRANSPORT_DISPATCH_NOT_ELIGIBLE', message, details);
  }
}
export class TransportQuantityExceededError extends TransportError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSPORT_QUANTITY_EXCEEDED',
      'La cantidad indicada excede la capacidad logística disponible.',
      details,
    );
  }
}
export class TransportResourceUnavailableError extends TransportError {
  constructor(resource: string, id: number, state?: string) {
    super(
      'TRANSPORT_RESOURCE_UNAVAILABLE',
      `El recurso ${resource} no está disponible para asignación.`,
      { resource, id, state },
    );
  }
}
export class TransportResourceNotFoundError extends TransportError {
  constructor(resource: string, id: number) {
    super('TRANSPORT_RESOURCE_NOT_FOUND', `El recurso ${resource} no existe.`, {
      resource,
      id,
    });
  }
}
export class TransportConcurrentModificationError extends TransportError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSPORT_CONCURRENT_MODIFICATION',
      'La operación fue modificada concurrentemente. Intenta nuevamente.',
      details,
    );
  }
}
export class TransportIdempotencyConflictError extends TransportError {
  constructor(details?: Record<string, unknown>) {
    super(
      'TRANSPORT_IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue utilizada por otra operación.',
      details,
    );
  }
}
export class TransportIncidentNotFoundError extends TransportError {
  constructor(id: number) {
    super('TRANSPORT_INCIDENT_NOT_FOUND', 'La incidencia no existe.', { id });
  }
}
