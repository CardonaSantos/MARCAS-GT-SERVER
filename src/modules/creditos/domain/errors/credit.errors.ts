export class CreditError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown> | null,
  ) { super(message); this.name = new.target.name; }
}
export class CreditApplicationNotFoundError extends CreditError { constructor(id:number){ super('CREDIT_APPLICATION_NOT_FOUND','La solicitud de crédito no existe.',{id}); } }
export class CreditPolicyNotFoundError extends CreditError { constructor(id:number){ super('CREDIT_POLICY_NOT_FOUND','La política de crédito no existe.',{id}); } }
export class CreditActorNotFoundError extends CreditError { constructor(id:number){ super('CREDIT_ACTOR_NOT_FOUND','El usuario no existe o está inactivo.',{actorId:id}); } }
export class CreditCompanyRequiredError extends CreditError { constructor(id:number){ super('CREDIT_COMPANY_REQUIRED','El usuario debe pertenecer a una empresa para operar crédito.',{actorId:id}); } }
export class CreditForbiddenError extends CreditError { constructor(message='No tienes permisos para realizar esta operación de crédito.'){ super('CREDIT_FORBIDDEN',message); } }
export class CreditValidationError extends CreditError { constructor(message:string,details?:Record<string,unknown>){ super('CREDIT_VALIDATION_ERROR',message,details); } }
export class CreditInvalidStateError extends CreditError { constructor(current:string,operation:string){ super('CREDIT_INVALID_STATE','La solicitud de crédito no se encuentra en un estado válido para esta operación.',{current,operation}); } }
export class CreditConcurrentModificationError extends CreditError { constructor(details?:Record<string,unknown>){ super('CREDIT_CONCURRENT_MODIFICATION','La solicitud de crédito fue modificada por otra operación.',details); } }
export class CreditActiveApplicationExistsError extends CreditError { constructor(pedidoId:number,solicitudId?:number){ super('CREDIT_ACTIVE_APPLICATION_EXISTS','El pedido ya tiene una solicitud de crédito vigente.',{pedidoId,solicitudId:solicitudId??null}); } }
export class CreditOrderInvalidError extends CreditError { constructor(message:string,details?:Record<string,unknown>){ super('CREDIT_ORDER_INVALID',message,details); } }
export class CreditPolicyInactiveError extends CreditError { constructor(id:number){ super('CREDIT_POLICY_INACTIVE','La política de crédito está inactiva.',{id}); } }
export class CreditDecisionNotReadyError extends CreditError { constructor(details?:Record<string,unknown>){ super('CREDIT_DECISION_NOT_READY','El expediente todavía no está listo para una decisión aprobatoria.',details); } }
export class CreditAlreadyDecidedError extends CreditError { constructor(id:number){ super('CREDIT_ALREADY_DECIDED','La solicitud ya tiene una decisión final.',{id}); } }
export class CreditIdempotencyConflictError extends CreditError { constructor(key:string){ super('CREDIT_IDEMPOTENCY_CONFLICT','La clave de idempotencia ya fue utilizada por otra operación.',{claveIdempotencia:key}); } }
export class CreditIntegrationNotFoundError extends CreditError { constructor(id:number){ super('CREDIT_INTEGRATION_NOT_FOUND','La solicitud no tiene una operación de integración con Pedido.',{applicationId:id}); } }

export class CreditNotFoundError extends CreditError { constructor(id:number){ super('CREDIT_NOT_FOUND','El crédito no existe.',{id}); } }
export class CreditPaymentPlanNotFoundError extends CreditError { constructor(creditoId:number){ super('CREDIT_PAYMENT_PLAN_NOT_FOUND','El crédito no tiene un plan de pagos.',{creditoId}); } }
export class CreditPaymentPlanExistsError extends CreditError { constructor(creditoId:number,planPagoId?:number){ super('CREDIT_PAYMENT_PLAN_EXISTS','El crédito ya tiene un plan de pagos.',{creditoId,planPagoId:planPagoId??null}); } }
