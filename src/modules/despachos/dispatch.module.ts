import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import {
  BodegaDirectoryPort,
  BodegaModule,
  BODEGA_DIRECTORY,
} from '../bodegas';
import {
  InventarioModule,
  InventoryAvailabilityPort,
  InventoryOperationsPort,
  InventoryReservationDirectoryPort,
  INVENTORY_AVAILABILITY,
  INVENTORY_OPERATIONS,
  INVENTORY_RESERVATION_DIRECTORY,
} from '../inventario';
import {
  OrderDirectoryPort,
  OrderDispatchGatePort,
  PedidosModule,
  ORDER_DIRECTORY,
  ORDER_DISPATCH_GATE,
} from '../pedidos';
import { DispatchDirectoryPort } from './application/ports/dispatch-directory.port';
import { DispatchQueryPort } from './application/ports/dispatch-query.port';
import { AddDispatchObservationUseCase } from './application/use-cases/add-dispatch-observation.use-case';
import { CancelDispatchUseCase } from './application/use-cases/cancel-dispatch.use-case';
import { CompleteDispatchPreparationUseCase } from './application/use-cases/complete-dispatch-preparation.use-case';
import { CreateDispatchUseCase } from './application/use-cases/create-dispatch.use-case';
import { DispatchOperationCoordinator } from './application/use-cases/dispatch-operation.coordinator';
import { GetDispatchOperationalReportUseCase } from './application/use-cases/get-dispatch-operational-report.use-case';
import { GetDispatchSummaryUseCase } from './application/use-cases/get-dispatch-summary.use-case';
import { GetDispatchUseCase } from './application/use-cases/get-dispatch.use-case';
import { ListDispatchCandidatesUseCase } from './application/use-cases/list-dispatch-candidates.use-case';
import { ListDispatchEventsUseCase } from './application/use-cases/list-dispatch-events.use-case';
import { ListDispatchOperationsUseCase } from './application/use-cases/list-dispatch-operations.use-case';
import { ListDispatchesUseCase } from './application/use-cases/list-dispatches.use-case';
import { RegisterDispatchOutputUseCase } from './application/use-cases/register-dispatch-output.use-case';
import { RetryDispatchOperationUseCase } from './application/use-cases/retry-dispatch-operation.use-case';
import { StartDispatchPreparationUseCase } from './application/use-cases/start-dispatch-preparation.use-case';
import { UpdateDispatchPreparationUseCase } from './application/use-cases/update-dispatch-preparation.use-case';
import { UpdateDispatchUseCase } from './application/use-cases/update-dispatch.use-case';
import { DispatchActorDirectoryPort } from './domain/ports/dispatch-actor-directory.port';
import { DispatchOperationRepositoryPort } from './domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from './domain/ports/dispatch.repository.port';
import {
  DISPATCH_ACTOR_DIRECTORY,
  DISPATCH_DIRECTORY,
  DISPATCH_OPERATION_REPOSITORY,
  DISPATCH_QUERY,
  DISPATCH_REPOSITORY,
} from './dispatch.tokens';
import { DispatchActorDirectoryPrismaAdapter } from './infrastructure/adapters/dispatch-actor-directory.prisma-adapter';
import { DispatchDirectoryAdapter } from './infrastructure/adapters/dispatch-directory.adapter';
import { DispatchOperationPrismaRepository } from './infrastructure/persistence/prisma/dispatch-operation.prisma-repository';
import { DispatchPrismaQueryAdapter } from './infrastructure/persistence/prisma/dispatch.prisma-query.adapter';
import { DispatchPrismaRepository } from './infrastructure/persistence/prisma/dispatch.prisma-repository';
import { DispatchController } from './presentation/http/dispatch.controller';

@Module({
  imports: [BodegaModule, InventarioModule, PedidosModule],
  controllers: [DispatchController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,

    DispatchPrismaRepository,
    DispatchOperationPrismaRepository,
    DispatchPrismaQueryAdapter,
    DispatchActorDirectoryPrismaAdapter,
    DispatchDirectoryAdapter,

    {
      provide: DISPATCH_REPOSITORY,
      useExisting: DispatchPrismaRepository,
    },
    {
      provide: DISPATCH_OPERATION_REPOSITORY,
      useExisting: DispatchOperationPrismaRepository,
    },
    {
      provide: DISPATCH_QUERY,
      useExisting: DispatchPrismaQueryAdapter,
    },
    {
      provide: DISPATCH_ACTOR_DIRECTORY,
      useExisting: DispatchActorDirectoryPrismaAdapter,
    },
    {
      provide: DISPATCH_DIRECTORY,
      useExisting: DispatchDirectoryAdapter,
    },

    {
      provide: DispatchOperationCoordinator,
      useFactory: (
        operations: DispatchOperationRepositoryPort,
        dispatches: DispatchRepositoryPort,
        inventory: InventoryOperationsPort,
        reservations: InventoryReservationDirectoryPort,
        orders: OrderDispatchGatePort,
      ) =>
        new DispatchOperationCoordinator(
          operations,
          dispatches,
          inventory,
          reservations,
          orders,
        ),
      inject: [
        DISPATCH_OPERATION_REPOSITORY,
        DISPATCH_REPOSITORY,
        INVENTORY_OPERATIONS,
        INVENTORY_RESERVATION_DIRECTORY,
        ORDER_DISPATCH_GATE,
      ],
    },

    {
      provide: CreateDispatchUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
        bodegas: BodegaDirectoryPort,
      ) =>
        new CreateDispatchUseCase(
          repository,
          users,
          orders,
          bodegas,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
        BODEGA_DIRECTORY,
      ],
    },
    {
      provide: UpdateDispatchUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
        bodegas: BodegaDirectoryPort,
      ) =>
        new UpdateDispatchUseCase(
          repository,
          users,
          orders,
          bodegas,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
        BODEGA_DIRECTORY,
      ],
    },
    {
      provide: StartDispatchPreparationUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        operations: DispatchOperationRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
        availability: InventoryAvailabilityPort,
        coordinator: DispatchOperationCoordinator,
      ) =>
        new StartDispatchPreparationUseCase(
          repository,
          operations,
          users,
          orders,
          availability,
          coordinator,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_OPERATION_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
        INVENTORY_AVAILABILITY,
        DispatchOperationCoordinator,
      ],
    },
    {
      provide: UpdateDispatchPreparationUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
      ) =>
        new UpdateDispatchPreparationUseCase(
          repository,
          users,
          orders,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
      ],
    },
    {
      provide: CompleteDispatchPreparationUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
      ) =>
        new CompleteDispatchPreparationUseCase(
          repository,
          users,
          orders,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
      ],
    },
    {
      provide: RegisterDispatchOutputUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        operations: DispatchOperationRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
        coordinator: DispatchOperationCoordinator,
      ) =>
        new RegisterDispatchOutputUseCase(
          repository,
          operations,
          users,
          orders,
          coordinator,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_OPERATION_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
        DispatchOperationCoordinator,
      ],
    },
    {
      provide: CancelDispatchUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        operations: DispatchOperationRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
        coordinator: DispatchOperationCoordinator,
      ) =>
        new CancelDispatchUseCase(
          repository,
          operations,
          users,
          orders,
          coordinator,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_OPERATION_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
        DispatchOperationCoordinator,
      ],
    },
    {
      provide: RetryDispatchOperationUseCase,
      useFactory: (
        operations: DispatchOperationRepositoryPort,
        users: DispatchActorDirectoryPort,
        coordinator: DispatchOperationCoordinator,
      ) =>
        new RetryDispatchOperationUseCase(
          operations,
          users,
          coordinator,
        ),
      inject: [
        DISPATCH_OPERATION_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        DispatchOperationCoordinator,
      ],
    },
    {
      provide: AddDispatchObservationUseCase,
      useFactory: (
        repository: DispatchRepositoryPort,
        users: DispatchActorDirectoryPort,
        orders: OrderDirectoryPort,
      ) =>
        new AddDispatchObservationUseCase(
          repository,
          users,
          orders,
        ),
      inject: [
        DISPATCH_REPOSITORY,
        DISPATCH_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
      ],
    },

    {
      provide: ListDispatchCandidatesUseCase,
      useFactory: (
        query: DispatchQueryPort,
        users: DispatchActorDirectoryPort,
      ) => new ListDispatchCandidatesUseCase(query, users),
      inject: [DISPATCH_QUERY, DISPATCH_ACTOR_DIRECTORY],
    },
    {
      provide: ListDispatchesUseCase,
      useFactory: (
        query: DispatchQueryPort,
        users: DispatchActorDirectoryPort,
      ) => new ListDispatchesUseCase(query, users),
      inject: [DISPATCH_QUERY, DISPATCH_ACTOR_DIRECTORY],
    },
    {
      provide: GetDispatchUseCase,
      useFactory: (
        query: DispatchQueryPort,
        users: DispatchActorDirectoryPort,
      ) => new GetDispatchUseCase(query, users),
      inject: [DISPATCH_QUERY, DISPATCH_ACTOR_DIRECTORY],
    },
    {
      provide: ListDispatchEventsUseCase,
      useFactory: (
        query: DispatchQueryPort,
        users: DispatchActorDirectoryPort,
      ) => new ListDispatchEventsUseCase(query, users),
      inject: [DISPATCH_QUERY, DISPATCH_ACTOR_DIRECTORY],
    },
    {
      provide: ListDispatchOperationsUseCase,
      useFactory: (
        query: DispatchQueryPort,
        users: DispatchActorDirectoryPort,
      ) => new ListDispatchOperationsUseCase(query, users),
      inject: [DISPATCH_QUERY, DISPATCH_ACTOR_DIRECTORY],
    },
    {
      provide: GetDispatchOperationalReportUseCase,
      useFactory: (
        query: DispatchQueryPort,
        users: DispatchActorDirectoryPort,
      ) => new GetDispatchOperationalReportUseCase(query, users),
      inject: [DISPATCH_QUERY, DISPATCH_ACTOR_DIRECTORY],
    },
    {
      provide: GetDispatchSummaryUseCase,
      useFactory: (
        query: DispatchQueryPort,
        users: DispatchActorDirectoryPort,
      ) => new GetDispatchSummaryUseCase(query, users),
      inject: [DISPATCH_QUERY, DISPATCH_ACTOR_DIRECTORY],
    },
  ],
  exports: [DISPATCH_DIRECTORY],
})
export class DespachosModule {}
