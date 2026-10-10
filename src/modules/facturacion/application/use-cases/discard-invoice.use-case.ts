import { Invoice } from '../../domain/entities/invoice.entity';
import {
  BillingNotFoundError,
  BillingValidationError,
} from '../../domain/errors/billing.errors';
import { InvoiceRepositoryPort } from '../../domain/ports/invoice.repository.port';
import { DiscardInvoiceCommand } from '../models/billing.models';
import { BillingActorDirectoryPort } from '../ports/billing-actor-directory.port';
import {
  assertBillingOperator,
  requireBillingActor,
} from './billing.helpers';

export class DiscardInvoiceUseCase {
  constructor(
    private readonly invoices: InvoiceRepositoryPort,
    private readonly actors: BillingActorDirectoryPort,
  ) {}

  async execute(command: DiscardInvoiceCommand): Promise<void> {
    const actor = await requireBillingActor(this.actors, command.actorId);
    assertBillingOperator(actor);

    const row = await this.invoices.findById(command.id);
    if (!row) throw new BillingNotFoundError(command.id);
    if (row.empresaId !== actor.empresaId) {
      throw new BillingValidationError('La factura pertenece a otra empresa.');
    }

    const invoice = Invoice.rehydrate(row);
    invoice.discard(command.motivo);

    await this.invoices.discard(
      row.id,
      actor.id,
      invoice.motivoDescarte!,
      row.version,
      command.claveIdempotencia.trim(),
    );
  }
}
