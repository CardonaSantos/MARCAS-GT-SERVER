import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import {
  DeliveryDirectoryPort,
  EntregasModule,
  DELIVERY_DIRECTORY,
} from '../entregas';
import {
  ORDER_BILLING_DIRECTORY,
  OrderBillingDirectoryPort,
  PedidosModule,
} from '../pedidos';
import { CreditosModule } from '../creditos';
import { BillingActorDirectoryPort } from './application/ports/billing-actor-directory.port';
import { BillingProductDirectoryPort } from './application/ports/billing-product-directory.port';
import {
  BillingDirectoryPort,
  BillingQueryPort,
  ReceivableDirectoryPort,
} from './application/ports/billing-query.port';
import { FiscalConfigPort } from './application/ports/fiscal-config.port';
import { CreateInvoiceFromDeliveriesUseCase } from './application/use-cases/create-invoice-from-deliveries.use-case';
import { DiscardInvoiceUseCase } from './application/use-cases/discard-invoice.use-case';
import { FiscalConfigCommands } from './application/use-cases/fiscal-config.use-cases';
import { PrepareInvoiceUseCase } from './application/use-cases/prepare-invoice.use-case';
import {
  GetBillingOperationalReportUseCase,
  GetBillingSummaryUseCase,
  GetInvoiceUseCase,
  GetReceivableSummaryUseCase,
  ListBillingCandidatesUseCase,
  ListFelOperationsUseCase,
  ListInvoiceEventsUseCase,
  ListInvoicesUseCase,
  ListReceivablesUseCase,
} from './application/use-cases/read.use-cases';
import { FiscalDocumentRepositoryPort } from './domain/ports/fiscal-document.repository.port';
import { InvoiceRepositoryPort } from './domain/ports/invoice.repository.port';
import { BillingActorDirectoryPrismaAdapter } from './infrastructure/adapters/billing-actor-directory.prisma-adapter';
import { BillingProductDirectoryPrismaAdapter } from './infrastructure/adapters/billing-product-directory.prisma-adapter';
import { FelProviderRegistryAdapter } from './infrastructure/adapters/fel-provider-registry.adapter';
import { FiscalConfigPrismaAdapter } from './infrastructure/adapters/fiscal-config.prisma-adapter';
import { GrupoCdsFelAdapter } from './infrastructure/adapters/grupo-cds/grupo-cds-fel.adapter';
import { BillingPrismaQueryAdapter } from './infrastructure/persistence/prisma/billing.prisma-query.adapter';
import { FiscalDocumentPrismaRepository } from './infrastructure/persistence/prisma/fiscal-document.prisma-repository';
import { InvoicePrismaRepository } from './infrastructure/persistence/prisma/invoice.prisma-repository';
import { ReceivableDirectoryPrismaAdapter } from './infrastructure/persistence/prisma/receivable-directory.prisma-adapter';
import { BillingController } from './presentation/http/billing.controller';
import { FiscalConfigController } from './presentation/http/fiscal-config.controller';
import { ReceivableController } from './presentation/http/receivable.controller';
import {
  BILLING_ACTOR_DIRECTORY,
  BILLING_DIRECTORY,
  BILLING_FISCAL_CONFIG,
  BILLING_FISCAL_REPOSITORY,
  BILLING_INVOICE_REPOSITORY,
  BILLING_PRODUCT_DIRECTORY,
  BILLING_QUERY,
  FEL_PROVIDER_REGISTRY,
  RECEIVABLE_DIRECTORY,
} from './billing.tokens';

@Module({
  imports: [PedidosModule, EntregasModule, CreditosModule],
  controllers: [
    BillingController,
    ReceivableController,
    FiscalConfigController,
  ],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    InvoicePrismaRepository,
    FiscalDocumentPrismaRepository,
    BillingPrismaQueryAdapter,
    ReceivableDirectoryPrismaAdapter,
    BillingActorDirectoryPrismaAdapter,
    BillingProductDirectoryPrismaAdapter,
    FiscalConfigPrismaAdapter,
    GrupoCdsFelAdapter,
    FelProviderRegistryAdapter,

    {
      provide: BILLING_INVOICE_REPOSITORY,
      useExisting: InvoicePrismaRepository,
    },
    {
      provide: BILLING_FISCAL_REPOSITORY,
      useExisting: FiscalDocumentPrismaRepository,
    },
    { provide: BILLING_QUERY, useExisting: BillingPrismaQueryAdapter },
    { provide: BILLING_DIRECTORY, useExisting: BillingPrismaQueryAdapter },
    {
      provide: RECEIVABLE_DIRECTORY,
      useExisting: ReceivableDirectoryPrismaAdapter,
    },
    {
      provide: BILLING_ACTOR_DIRECTORY,
      useExisting: BillingActorDirectoryPrismaAdapter,
    },
    {
      provide: BILLING_PRODUCT_DIRECTORY,
      useExisting: BillingProductDirectoryPrismaAdapter,
    },
    {
      provide: BILLING_FISCAL_CONFIG,
      useExisting: FiscalConfigPrismaAdapter,
    },
    {
      provide: FEL_PROVIDER_REGISTRY,
      useExisting: FelProviderRegistryAdapter,
    },

    {
      provide: CreateInvoiceFromDeliveriesUseCase,
      useFactory: (
        invoices: InvoiceRepositoryPort,
        actors: BillingActorDirectoryPort,
        deliveries: DeliveryDirectoryPort,
        orders: OrderBillingDirectoryPort,
        products: BillingProductDirectoryPort,
      ) =>
        new CreateInvoiceFromDeliveriesUseCase(
          invoices,
          actors,
          deliveries,
          orders,
          products,
        ),
      inject: [
        BILLING_INVOICE_REPOSITORY,
        BILLING_ACTOR_DIRECTORY,
        DELIVERY_DIRECTORY,
        ORDER_BILLING_DIRECTORY,
        BILLING_PRODUCT_DIRECTORY,
      ],
    },
    {
      provide: DiscardInvoiceUseCase,
      useFactory: (
        invoices: InvoiceRepositoryPort,
        actors: BillingActorDirectoryPort,
      ) => new DiscardInvoiceUseCase(invoices, actors),
      inject: [BILLING_INVOICE_REPOSITORY, BILLING_ACTOR_DIRECTORY],
    },
    {
      provide: PrepareInvoiceUseCase,
      useFactory: (
        invoices: InvoiceRepositoryPort,
        fiscalDocuments: FiscalDocumentRepositoryPort,
        actors: BillingActorDirectoryPort,
        fiscal: FiscalConfigPort,
      ) =>
        new PrepareInvoiceUseCase(
          invoices,
          fiscalDocuments,
          actors,
          fiscal,
        ),
      inject: [
        BILLING_INVOICE_REPOSITORY,
        BILLING_FISCAL_REPOSITORY,
        BILLING_ACTOR_DIRECTORY,
        BILLING_FISCAL_CONFIG,
      ],
    },
    {
      provide: FiscalConfigCommands,
      useFactory: (
        fiscal: FiscalConfigPort,
        actors: BillingActorDirectoryPort,
      ) => new FiscalConfigCommands(fiscal, actors),
      inject: [BILLING_FISCAL_CONFIG, BILLING_ACTOR_DIRECTORY],
    },

    ...readProviders(),
  ],
  exports: [BILLING_DIRECTORY, RECEIVABLE_DIRECTORY, FEL_PROVIDER_REGISTRY],
})
export class FacturacionModule {}

function readProviders() {
  const queryFactory = (
    UseCase: new (
      query: BillingQueryPort,
      actors: BillingActorDirectoryPort,
    ) => unknown,
  ) => ({
    provide: UseCase,
    useFactory: (
      query: BillingQueryPort,
      actors: BillingActorDirectoryPort,
    ) => new UseCase(query, actors),
    inject: [BILLING_QUERY, BILLING_ACTOR_DIRECTORY],
  });

  return [
    queryFactory(ListInvoicesUseCase),
    queryFactory(ListBillingCandidatesUseCase),
    queryFactory(GetInvoiceUseCase),
    queryFactory(ListInvoiceEventsUseCase),
    queryFactory(ListFelOperationsUseCase),
    queryFactory(GetBillingSummaryUseCase),
    queryFactory(GetBillingOperationalReportUseCase),
    queryFactory(ListReceivablesUseCase),
    queryFactory(GetReceivableSummaryUseCase),
  ];
}
