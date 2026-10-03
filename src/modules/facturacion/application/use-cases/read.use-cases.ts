import { BillingNotFoundError } from '../../domain/errors/billing.errors';
import {
  BillingCandidateFilters,
  BillingRangeFilters,
  InvoiceListFilters,
} from '../models/billing.models';
import { BillingActorDirectoryPort } from '../ports/billing-actor-directory.port';
import { BillingQueryPort } from '../ports/billing-query.port';
import { billingReadScope, requireBillingActor } from './billing.helpers';

export class ListInvoicesUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(filters: Omit<InvoiceListFilters, 'scope'>, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.list({ ...filters, scope: billingReadScope(actor) });
  }
}

export class ListBillingCandidatesUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(filters: Omit<BillingCandidateFilters, 'scope'>, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.listCandidates({ ...filters, scope: billingReadScope(actor) });
  }
}

export class GetInvoiceUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(id: number, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    const view = await this.query.getById(id, billingReadScope(actor));
    if (!view) throw new BillingNotFoundError(id);
    return view;
  }
}

export class ListInvoiceEventsUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(id: number, page: number, limit: number, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.listEvents(id, billingReadScope(actor), page, limit);
  }
}

export class ListFelOperationsUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(id: number, page: number, limit: number, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.listFelOperations(id, billingReadScope(actor), page, limit);
  }
}

export class GetBillingSummaryUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(filters: Omit<BillingRangeFilters, 'scope'>, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.getSummary({ ...filters, scope: billingReadScope(actor) });
  }
}

export class GetBillingOperationalReportUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(filters: Omit<BillingRangeFilters, 'scope'>, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.getOperationalReport({ ...filters, scope: billingReadScope(actor) });
  }
}

export class ListReceivablesUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(filters: { page: number; limit: number; search?: string; estado?: string; clienteId?: number; soloVencidas?: boolean }, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.listReceivables({ ...filters, scope: billingReadScope(actor) });
  }
}

export class GetReceivableSummaryUseCase {
  constructor(private readonly query: BillingQueryPort, private readonly actors: BillingActorDirectoryPort) {}
  async execute(filters: Omit<BillingRangeFilters, 'scope'>, actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    return this.query.getReceivableSummary({ ...filters, scope: billingReadScope(actor) });
  }
}
