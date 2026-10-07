import { PaymentNotFoundError } from '../../domain/errors/payment.errors';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentQueryPort } from '../ports/payment-query.port';
import {
  assertPaymentOperator,
  paymentReadScope,
  requirePaymentActor,
} from './payment.helpers';

export class ListPaymentBanksUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(actorId: number) {
    const actor = await requirePaymentActor(this.actors, actorId);
    return this.query.listBanks(paymentReadScope(actor));
  }
}

export class ListPaymentBanksAdminUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(actorId: number) {
    const actor = await requirePaymentActor(this.actors, actorId);

    assertPaymentOperator(actor);
    return this.query.listBanksAdmin(paymentReadScope(actor));
  }
}

export class ListPaymentsUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(filters: any, actorId: number) {
    const actor = await requirePaymentActor(this.actors, actorId);
    return this.query.list({
      ...filters,
      scope: paymentReadScope(actor),
    });
  }
}

export class GetPaymentUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(id: number, actorId: number) {
    const actor = await requirePaymentActor(this.actors, actorId);
    const result = await this.query.getById(
      id,
      paymentReadScope(actor),
    );

    if (!result) {
      throw new PaymentNotFoundError(id);
    }

    return result;
  }
}

export class ListPaymentEventsUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(
    id: number,
    page: number,
    limit: number,
    actorId: number,
  ) {
    const actor = await requirePaymentActor(this.actors, actorId);
    return this.query.listEvents(
      id,
      paymentReadScope(actor),
      page,
      limit,
    );
  }
}

export class ListPaymentApplicationsUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(
    id: number,
    page: number,
    limit: number,
    actorId: number,
  ) {
    const actor = await requirePaymentActor(this.actors, actorId);
    return this.query.listApplications(
      id,
      paymentReadScope(actor),
      page,
      limit,
    );
  }
}

export class ListReceivableCandidatesUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(
    id: number,
    page: number,
    limit: number,
    actorId: number,
  ) {
    const actor = await requirePaymentActor(this.actors, actorId);
    return this.query.listReceivableCandidates(
      id,
      paymentReadScope(actor),
      page,
      limit,
    );
  }
}

export class GetPaymentSummaryUseCase {
  constructor(
    private readonly query: PaymentQueryPort,
    private readonly actors: PaymentActorDirectoryPort,
  ) {}

  async execute(filters: any, actorId: number) {
    const actor = await requirePaymentActor(this.actors, actorId);
    return this.query.getSummary({
      ...filters,
      scope: paymentReadScope(actor),
    });
  }
}
