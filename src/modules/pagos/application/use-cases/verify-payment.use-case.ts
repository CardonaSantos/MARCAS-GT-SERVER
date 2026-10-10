import { Pago } from '../../domain/entities/payment.entity';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentWorkflowPort } from '../ports/payment-workflow.port';
import {
  assertEventIdempotency,
  assertPaymentOperator,
  requirePaymentActor,
  requireScopedPayment,
} from './payment.helpers';

export class VerifyPaymentUseCase {
  constructor(
    private readonly workflow: PaymentWorkflowPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(command: {
    id: number;
    actorId: number;
    claveIdempotencia: string;
  }) {
    const actor = await requirePaymentActor(this.actors, command.actorId);
    assertPaymentOperator(actor);

    if (
      await assertEventIdempotency(
        this.workflow,
        command.claveIdempotencia,
        command.id,
        'VERIFICADO',
      )
    ) {
      return requireScopedPayment(
        this.workflow,
        command.id,
        actor.empresaId,
      );
    }

    const current = await requireScopedPayment(
      this.workflow,
      command.id,
      actor.empresaId,
    );

    const payment = Pago.rehydrate(current);
    const expectedVersion = payment.version;
    const at = new Date();

    payment.verify(actor.id, at);

    return this.workflow.verify({
      pagoId: command.id,
      expectedVersion,
      actorId: actor.id,
      at,
      claveIdempotencia: command.claveIdempotencia,
    });
  }
}
