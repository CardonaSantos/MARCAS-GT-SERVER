import { createHash } from 'crypto';
import { BillingActor } from '../../billing.types';
import {
  BillingForbiddenError,
  BillingValidationError,
} from '../../domain/errors/billing.errors';
import { BillingActorDirectoryPort } from '../ports/billing-actor-directory.port';

export async function requireBillingActor(
  actors: BillingActorDirectoryPort,
  actorId: number,
): Promise<BillingActor & { empresaId: number }> {
  const actor = await actors.findById(actorId);
  if (!actor || !actor.activo) {
    throw new BillingForbiddenError('Usuario inexistente o inactivo.');
  }
  if (!actor.empresaId) {
    throw new BillingForbiddenError('El usuario no tiene empresa asignada.');
  }
  return actor as BillingActor & { empresaId: number };
}

export function assertBillingOperator(actor: { rol: string }): void {
  if (!['ADMIN', 'CONTABILIDAD'].includes(actor.rol)) {
    throw new BillingForbiddenError(
      'Solo ADMIN o CONTABILIDAD pueden operar facturación.',
    );
  }
}

export function billingReadScope(actor: BillingActor & { empresaId: number }) {
  return {
    empresaId: actor.empresaId,
    rol: actor.rol,
    ...(actor.rol === 'VENDEDOR' ? { vendedorId: actor.id } : {}),
  };
}

export function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BillingValidationError(`El campo ${field} debe ser un entero positivo.`, {
      [field]: value,
    });
  }
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}
