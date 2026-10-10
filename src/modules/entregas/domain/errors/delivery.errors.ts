export class DeliveryDomainError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
  }
}
export class DeliveryNotFoundError extends DeliveryDomainError {
  constructor(id: number) { super('Entrega no encontrada.', { entregaId: id }); }
}
export class DeliveryForbiddenError extends DeliveryDomainError {}
export class DeliveryValidationError extends DeliveryDomainError {}
export class DeliveryInvalidStateError extends DeliveryDomainError {
  constructor(state: string, action: string) {
    super(`No se puede ${action} cuando la entrega está en estado ${state}.`, { state, action });
  }
}
export class DeliveryConcurrentModificationError extends DeliveryDomainError {
  constructor(details?: Record<string, unknown>) { super('La entrega fue modificada por otra operación.', details); }
}
export class DeliveryIdempotencyConflictError extends DeliveryDomainError {
  constructor(details?: Record<string, unknown>) { super('La clave de idempotencia ya pertenece a otra operación.', details); }
}
