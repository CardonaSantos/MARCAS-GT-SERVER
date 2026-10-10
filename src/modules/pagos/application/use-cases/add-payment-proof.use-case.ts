import {
  PaymentForbiddenError,
  PaymentIdempotencyConflictError,
  PaymentInvalidStateError,
} from '../../domain/errors/payment.errors';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentContextPort } from '../ports/payment-context.port';
import { PaymentWorkflowPort } from '../ports/payment-workflow.port';
import {
  requirePaymentActor,
  requireScopedPayment,
} from './payment.helpers';

export class AddPaymentProofUseCase {
  constructor(
    private readonly workflow: PaymentWorkflowPort,
    private readonly actors: PaymentActorDirectoryPort,
    private readonly context: PaymentContextPort,
  ) {}

  async execute(command: {
    id: number;
    actorId: number;
    url: string;
    key?: string;
    mimeType?: string;
    size?: number;
    descripcion?: string;
    claveIdempotencia: string;
  }) {
    const actor = await requirePaymentActor(this.actors, command.actorId);

    const repeated = await this.workflow.findProofByKey(
      command.claveIdempotencia,
    );

    if (repeated) {
      if (repeated.pagoId !== command.id) {
        throw new PaymentIdempotencyConflictError({
          claveIdempotencia: command.claveIdempotencia,
        });
      }

      return repeated;
    }

    const payment = await requireScopedPayment(
      this.workflow,
      command.id,
      actor.empresaId,
    );

    if (['RECHAZADO', 'ANULADO'].includes(payment.estado)) {
      throw new PaymentInvalidStateError(
        payment.estado,
        'agregar comprobantes a',
      );
    }

    if (actor.rol === 'VENDEDOR') {
      if (!payment.pedidoId) {
        throw new PaymentForbiddenError(
          'VENDEDOR no puede modificar un pago sin pedido asociado.',
        );
      }

      const order = await this.context.findOrder(payment.pedidoId);

      if (!order || order.vendedorId !== actor.id) {
        throw new PaymentForbiddenError(
          'VENDEDOR solo puede adjuntar comprobantes a pagos de sus pedidos.',
        );
      }
    } else if (!['ADMIN', 'CONTABILIDAD'].includes(actor.rol)) {
      throw new PaymentForbiddenError();
    }

    return this.workflow.addProof({
      pagoId: payment.id,
      expectedVersion: payment.version,
      actorId: actor.id,
      url: command.url.trim(),
      key: normalize(command.key),
      mimeType: normalize(command.mimeType),
      size: command.size ?? null,
      descripcion: normalize(command.descripcion),
      claveIdempotencia: command.claveIdempotencia,
    });
  }
}

function normalize(value?: string | null): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}
