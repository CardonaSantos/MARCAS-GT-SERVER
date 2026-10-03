import { BillingForbiddenError } from '../../domain/errors/billing.errors';
import { BillingActorDirectoryPort } from '../ports/billing-actor-directory.port';
import { FiscalConfigPort } from '../ports/fiscal-config.port';
import { requireBillingActor } from './billing.helpers';

export class FiscalConfigCommands {
  constructor(
    private readonly fiscal: FiscalConfigPort,
    private readonly actors: BillingActorDirectoryPort,
  ) {}

  async upsertCompany(input: Parameters<FiscalConfigPort['upsertCompanyProfile']>[0], actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    if (actor.rol !== 'ADMIN' || actor.empresaId !== input.empresaId) {
      throw new BillingForbiddenError('Solo ADMIN puede configurar el perfil fiscal de su empresa.');
    }
    return this.fiscal.upsertCompanyProfile(input);
  }

  async createEstablishment(input: Parameters<FiscalConfigPort['createEstablishment']>[0], actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    if (actor.rol !== 'ADMIN' || actor.empresaId !== input.empresaId) {
      throw new BillingForbiddenError('Solo ADMIN puede configurar establecimientos fiscales.');
    }
    return this.fiscal.createEstablishment(input);
  }

  async upsertCustomer(input: Parameters<FiscalConfigPort['upsertCustomerProfile']>[0], actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    if (!['ADMIN', 'CONTABILIDAD'].includes(actor.rol)) {
      throw new BillingForbiddenError('Solo ADMIN o CONTABILIDAD pueden configurar perfiles fiscales de clientes.');
    }
    return this.fiscal.upsertCustomerProfile(input);
  }

  async upsertProduct(input: Parameters<FiscalConfigPort['upsertProductProfile']>[0], actorId: number) {
    const actor = await requireBillingActor(this.actors, actorId);
    if (!['ADMIN', 'CONTABILIDAD'].includes(actor.rol)) {
      throw new BillingForbiddenError('Solo ADMIN o CONTABILIDAD pueden configurar perfiles fiscales de productos.');
    }
    return this.fiscal.upsertProductProfile(input);
  }
}
