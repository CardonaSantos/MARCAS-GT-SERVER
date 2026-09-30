import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { BodegaModule } from '../bodegas';
import { BODEGA_DIRECTORY } from '../bodegas';
import { BodegaDirectoryPort } from '../bodegas';
import { InventarioModule } from '../inventario';
import { INVENTORY_OPERATIONS } from '../inventario';
import { InventoryOperationsPort } from '../inventario';
import { ApproveRequisitionUseCase } from './application/use-cases/approve-requisition.use-case';
import { CancelRequisitionUseCase } from './application/use-cases/cancel-requisition.use-case';
import { CreateRequisitionUseCase } from './application/use-cases/create-requisition.use-case';
import { GetRequisitionSummaryUseCase } from './application/use-cases/get-requisition-summary.use-case';
import { GetRequisitionUseCase } from './application/use-cases/get-requisition.use-case';
import { ListRequisitionEventsUseCase } from './application/use-cases/list-requisition-events.use-case';
import { ListRequisitionReceiptsUseCase } from './application/use-cases/list-requisition-receipts.use-case';
import { ListRequisitionsUseCase } from './application/use-cases/list-requisitions.use-case';
import { RegisterRequisitionReceiptUseCase } from './application/use-cases/register-requisition-receipt.use-case';
import { RejectRequisitionUseCase } from './application/use-cases/reject-requisition.use-case';
import { RequestRequisitionUseCase } from './application/use-cases/request-requisition.use-case';
import { UpdateRequisitionUseCase } from './application/use-cases/update-requisition.use-case';
import { RequisitionQueryPort } from './application/ports/requisition-query.port';
import { RequisitionActorDirectoryPort } from './domain/ports/requisition-actor-directory.port';
import { RequisitionCatalogPort } from './domain/ports/requisition-catalog.port';
import { RequisitionRepositoryPort } from './domain/ports/requisition.repository.port';
import { RequisitionActorDirectoryPrismaAdapter } from './infrastructure/adapters/requisition-actor-directory.prisma-adapter';
import { RequisitionCatalogPrismaAdapter } from './infrastructure/adapters/requisition-catalog.prisma-adapter';
import { RequisitionDirectoryAdapter } from './infrastructure/adapters/requisition-directory.adapter';
import { RequisitionPrismaQueryAdapter } from './infrastructure/persistence/prisma/requisition.prisma-query.adapter';
import { RequisitionPrismaRepository } from './infrastructure/persistence/prisma/requisition.prisma-repository';
import { RequisitionController } from './presentation/http/requisition.controller';
import {
  REQUISITION_ACTOR_DIRECTORY,
  REQUISITION_CATALOG,
  REQUISITION_DIRECTORY,
  REQUISITION_QUERY,
  REQUISITION_REPOSITORY,
} from './requisition.tokens';

@Module({
  imports: [BodegaModule, InventarioModule],
  controllers: [RequisitionController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    RequisitionPrismaRepository,
    RequisitionPrismaQueryAdapter,
    RequisitionCatalogPrismaAdapter,
    RequisitionActorDirectoryPrismaAdapter,
    RequisitionDirectoryAdapter,
    { provide: REQUISITION_REPOSITORY, useExisting: RequisitionPrismaRepository },
    { provide: REQUISITION_QUERY, useExisting: RequisitionPrismaQueryAdapter },
    { provide: REQUISITION_CATALOG, useExisting: RequisitionCatalogPrismaAdapter },
    { provide: REQUISITION_ACTOR_DIRECTORY, useExisting: RequisitionActorDirectoryPrismaAdapter },
    { provide: REQUISITION_DIRECTORY, useExisting: RequisitionDirectoryAdapter },
    {
      provide: CreateRequisitionUseCase,
      useFactory: (
        repository: RequisitionRepositoryPort,
        users: RequisitionActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        catalog: RequisitionCatalogPort,
      ) => new CreateRequisitionUseCase(repository, users, bodegas, catalog),
      inject: [REQUISITION_REPOSITORY, REQUISITION_ACTOR_DIRECTORY, BODEGA_DIRECTORY, REQUISITION_CATALOG],
    },
    {
      provide: UpdateRequisitionUseCase,
      useFactory: (
        repository: RequisitionRepositoryPort,
        users: RequisitionActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        catalog: RequisitionCatalogPort,
      ) => new UpdateRequisitionUseCase(repository, users, bodegas, catalog),
      inject: [REQUISITION_REPOSITORY, REQUISITION_ACTOR_DIRECTORY, BODEGA_DIRECTORY, REQUISITION_CATALOG],
    },
    { provide: RequestRequisitionUseCase, useFactory: (repository: RequisitionRepositoryPort, users: RequisitionActorDirectoryPort, bodegas: BodegaDirectoryPort) => new RequestRequisitionUseCase(repository, users, bodegas), inject: [REQUISITION_REPOSITORY, REQUISITION_ACTOR_DIRECTORY, BODEGA_DIRECTORY] },
    { provide: ApproveRequisitionUseCase, useFactory: (repository: RequisitionRepositoryPort, users: RequisitionActorDirectoryPort, bodegas: BodegaDirectoryPort, catalog: RequisitionCatalogPort) => new ApproveRequisitionUseCase(repository, users, bodegas, catalog), inject: [REQUISITION_REPOSITORY, REQUISITION_ACTOR_DIRECTORY, BODEGA_DIRECTORY, REQUISITION_CATALOG] },
    { provide: RejectRequisitionUseCase, useFactory: (repository: RequisitionRepositoryPort, users: RequisitionActorDirectoryPort) => new RejectRequisitionUseCase(repository, users), inject: [REQUISITION_REPOSITORY, REQUISITION_ACTOR_DIRECTORY] },
    { provide: CancelRequisitionUseCase, useFactory: (repository: RequisitionRepositoryPort, users: RequisitionActorDirectoryPort) => new CancelRequisitionUseCase(repository, users), inject: [REQUISITION_REPOSITORY, REQUISITION_ACTOR_DIRECTORY] },
    {
      provide: RegisterRequisitionReceiptUseCase,
      useFactory: (
        repository: RequisitionRepositoryPort,
        users: RequisitionActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        catalog: RequisitionCatalogPort,
        inventory: InventoryOperationsPort,
      ) => new RegisterRequisitionReceiptUseCase(repository, users, bodegas, catalog, inventory),
      inject: [REQUISITION_REPOSITORY, REQUISITION_ACTOR_DIRECTORY, BODEGA_DIRECTORY, REQUISITION_CATALOG, INVENTORY_OPERATIONS],
    },
    { provide: ListRequisitionsUseCase, useFactory: (query: RequisitionQueryPort) => new ListRequisitionsUseCase(query), inject: [REQUISITION_QUERY] },
    { provide: GetRequisitionUseCase, useFactory: (query: RequisitionQueryPort) => new GetRequisitionUseCase(query), inject: [REQUISITION_QUERY] },
    { provide: ListRequisitionEventsUseCase, useFactory: (query: RequisitionQueryPort) => new ListRequisitionEventsUseCase(query), inject: [REQUISITION_QUERY] },
    { provide: ListRequisitionReceiptsUseCase, useFactory: (query: RequisitionQueryPort) => new ListRequisitionReceiptsUseCase(query), inject: [REQUISITION_QUERY] },
    { provide: GetRequisitionSummaryUseCase, useFactory: (query: RequisitionQueryPort) => new GetRequisitionSummaryUseCase(query), inject: [REQUISITION_QUERY] },
  ],
  exports: [REQUISITION_DIRECTORY],
})
export class RequisicionesModule {}
