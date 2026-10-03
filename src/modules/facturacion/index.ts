export { FacturacionModule } from './billing.module';
export {
  BILLING_DIRECTORY,
  FEL_PROVIDER_REGISTRY,
  RECEIVABLE_DIRECTORY,
} from './billing.tokens';
export type {
  BillingDirectoryPort,
  ReceivableDirectoryPort,
} from './application/ports/billing-query.port';
export type {
  FelProviderPort,
  FelProviderRegistryPort,
} from './application/ports/fel-provider.port';
