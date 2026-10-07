import {
  PaymentBankNotFoundError,
  PaymentValidationError,
} from '../../domain/errors/payment.errors';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentBankRepositoryPort } from '../ports/payment-bank.port';
import {
  assertPaymentOperator,
  requirePaymentActor,
} from './payment.helpers';

function clean(value?: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

export class PaymentBankCommands {
  constructor(
    private readonly banks: PaymentBankRepositoryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async create(input: {
    actorId: number;
    nombre: string;
    codigo?: string;
    cuenta?: string;
    activo?: boolean;
  }) {
    const actor = await requirePaymentActor(this.actors, input.actorId);
    assertPaymentOperator(actor);

    const nombre = input.nombre.trim();
    if (nombre.length < 2) {
      throw new PaymentValidationError(
        'El nombre del banco debe tener al menos 2 caracteres.',
      );
    }

    return this.banks.create({
      empresaId: actor.empresaId,
      nombre,
      codigo: clean(input.codigo),
      cuenta: clean(input.cuenta),
      activo: input.activo ?? true,
    });
  }

  async update(input: {
    id: number;
    actorId: number;
    nombre?: string;
    codigo?: string | null;
    cuenta?: string | null;
    activo?: boolean;
  }) {
    const actor = await requirePaymentActor(this.actors, input.actorId);
    assertPaymentOperator(actor);

    const hasChanges =
      input.nombre !== undefined ||
      input.codigo !== undefined ||
      input.cuenta !== undefined ||
      input.activo !== undefined;

    if (!hasChanges) {
      throw new PaymentValidationError(
        'Debes enviar al menos un cambio para el banco.',
      );
    }

    if (input.nombre !== undefined && input.nombre.trim().length < 2) {
      throw new PaymentValidationError(
        'El nombre del banco debe tener al menos 2 caracteres.',
      );
    }

    try {
      return await this.banks.update({
        id: input.id,
        empresaId: actor.empresaId,
        ...(input.nombre !== undefined
          ? { nombre: input.nombre.trim() }
          : {}),
        ...(input.codigo !== undefined
          ? { codigo: clean(input.codigo) }
          : {}),
        ...(input.cuenta !== undefined
          ? { cuenta: clean(input.cuenta) }
          : {}),
        ...(input.activo !== undefined ? { activo: input.activo } : {}),
      });
    } catch (error) {
      if (error instanceof PaymentBankNotFoundError) throw error;
      throw error;
    }
  }
}
