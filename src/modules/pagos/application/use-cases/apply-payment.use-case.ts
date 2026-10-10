import {
  PaymentIdempotencyConflictError,
  PaymentValidationError,
} from '../../domain/errors/payment.errors';
import { PaymentMoney } from '../../domain/value-objects/payment-money.vo';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentWorkflowPort } from '../ports/payment-workflow.port';
import {
  assertPaymentOperator,
  requirePaymentActor,
  requireScopedPayment,
} from './payment.helpers';

export class ApplyPaymentUseCase {
  constructor(
    private readonly workflow: PaymentWorkflowPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(command: {
    id: number;
    actorId: number;
    cuentaPorCobrarId: number;
    monto: string;
    claveIdempotencia: string;
  }) {
    const actor = await requirePaymentActor(this.actors, command.actorId);
    assertPaymentOperator(actor);

    const amount = PaymentMoney.from(command.monto);

    if (!amount.isPositive()) {
      throw new PaymentValidationError(
        'El monto de la aplicación debe ser mayor a cero.',
      );
    }

    const previous = await this.workflow.findApplicationByKey(
      command.claveIdempotencia,
    );

    if (previous) {
      if (
        previous.pagoId !== command.id ||
        previous.cuentaPorCobrarId !== command.cuentaPorCobrarId ||
        previous.monto !== amount.toString()
      ) {
        throw new PaymentIdempotencyConflictError({
          claveIdempotencia: command.claveIdempotencia,
        });
      }

      return previous;
    }

    const payment = await requireScopedPayment(
      this.workflow,
      command.id,
      actor.empresaId,
    );

    return this.workflow.apply({
      pagoId: payment.id,
      expectedVersion: payment.version,
      cuentaPorCobrarId: command.cuentaPorCobrarId,
      monto: amount.toString(),
      actorId: actor.id,
      claveIdempotencia: command.claveIdempotencia,
    });
  }
}
