import { PaymentActor, PaymentReadScope } from '../../payment.types';
import {
  PaymentForbiddenError,
  PaymentIdempotencyConflictError,
  PaymentNotFoundError,
} from '../../domain/errors/payment.errors';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentWorkflowPort } from '../ports/payment-workflow.port';

export async function requirePaymentActor(
  actors: PaymentActorDirectoryPort,
  actorId: number,
): Promise<PaymentActor & { empresaId: number }> {
  const actor = await actors.findById(actorId);

  if (!actor || !actor.activo) {
    throw new PaymentForbiddenError('Usuario inexistente o inactivo.');
  }

  if (!actor.empresaId) {
    throw new PaymentForbiddenError('El usuario no tiene empresa asignada.');
  }

  return actor as PaymentActor & { empresaId: number };
}

export function assertPaymentRegistrar(actor: { rol: string }): void {
  if (!['ADMIN', 'CONTABILIDAD', 'VENDEDOR'].includes(actor.rol)) {
    throw new PaymentForbiddenError(
      'Solo ADMIN, CONTABILIDAD o VENDEDOR pueden registrar pagos.',
    );
  }
}

export function assertPaymentOperator(actor: { rol: string }): void {
  if (!['ADMIN', 'CONTABILIDAD'].includes(actor.rol)) {
    throw new PaymentForbiddenError(
      'Solo ADMIN o CONTABILIDAD pueden verificar, aplicar, revertir o anular pagos.',
    );
  }
}

export function paymentReadScope(
  actor: PaymentActor & { empresaId: number },
): PaymentReadScope {
  return {
    empresaId: actor.empresaId,
    rol: actor.rol,
    ...(actor.rol === 'VENDEDOR' ? { vendedorId: actor.id } : {}),
  };
}

export async function requireScopedPayment(
  workflow: PaymentWorkflowPort,
  id: number,
  empresaId: number,
) {
  const payment = await workflow.findById(id);

  if (!payment) {
    throw new PaymentNotFoundError(id);
  }

  if (payment.empresaId !== empresaId) {
    throw new PaymentForbiddenError();
  }

  return payment;
}

export async function assertEventIdempotency(
  workflow: PaymentWorkflowPort,
  key: string,
  pagoId: number,
  type: string,
): Promise<boolean> {
  const previous = await workflow.findEventByKey(key);

  if (!previous) {
    return false;
  }

  if (previous.pagoId !== pagoId || previous.tipo !== type) {
    throw new PaymentIdempotencyConflictError({
      claveIdempotencia: key,
      pagoId,
      tipo: type,
    });
  }

  return true;
}
