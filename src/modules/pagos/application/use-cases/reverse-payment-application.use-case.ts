import {
  PaymentIdempotencyConflictError,
  PaymentNotFoundError,
} from '../../domain/errors/payment.errors';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentWorkflowPort } from '../ports/payment-workflow.port';
import {
  assertEventIdempotency,
  assertPaymentOperator,
  requirePaymentActor,
  requireScopedPayment,
} from './payment.helpers';

export class ReversePaymentApplicationUseCase {
  constructor(
    private readonly workflow: PaymentWorkflowPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(command: {
    pagoId: number;
    aplicacionId: number;
    actorId: number;
    motivo: string;
    claveIdempotencia: string;
  }) {
    const actor = await requirePaymentActor(this.actors, command.actorId);
    assertPaymentOperator(actor);

    if (
      await assertEventIdempotency(
        this.workflow,
        command.claveIdempotencia,
        command.pagoId,
        'APLICACION_REVERTIDA',
      )
    ) {
      const previous = await this.workflow.findApplicationById(
        command.aplicacionId,
      );

      if (!previous || previous.pagoId !== command.pagoId) {
        throw new PaymentIdempotencyConflictError({
          claveIdempotencia: command.claveIdempotencia,
          aplicacionId: command.aplicacionId,
        });
      }

      return previous;
    }

    await requireScopedPayment(
      this.workflow,
      command.pagoId,
      actor.empresaId,
    );

    const application = await this.workflow.findApplicationById(
      command.aplicacionId,
    );

    if (!application || application.pagoId !== command.pagoId) {
      throw new PaymentNotFoundError();
    }

    return this.workflow.reverseApplication({
      pagoId: command.pagoId,
      aplicacionId: command.aplicacionId,
      actorId: actor.id,
      motivo: command.motivo,
      claveIdempotencia: command.claveIdempotencia,
    });
  }
}
