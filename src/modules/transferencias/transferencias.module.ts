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
  INVENTORY_AVAILABILITY,
  INVENTORY_OPERATIONS,
} from '../inventario';
import { TransferDirectoryPort } from './application/ports/transfer-directory.port';
import { TransferOperationRepositoryPort } from './application/ports/transfer-operation.repository.port';
import { TransferQueryPort } from './application/ports/transfer-query.port';
import { CancelTransferUseCase } from './application/use-cases/cancel-transfer.use-case';
import { CreateTransferUseCase } from './application/use-cases/create-transfer.use-case';
import { GetTransferSummaryUseCase } from './application/use-cases/get-transfer-summary.use-case';
import { GetTransferUseCase } from './application/use-cases/get-transfer.use-case';
import { ListTransferEventsUseCase } from './application/use-cases/list-transfer-events.use-case';
import { ListTransferOperationsUseCase } from './application/use-cases/list-transfer-operations.use-case';
import { ListTransfersUseCase } from './application/use-cases/list-transfers.use-case';
import { PrepareTransferUseCase } from './application/use-cases/prepare-transfer.use-case';
import { ReceiveTransferUseCase } from './application/use-cases/receive-transfer.use-case';
import { SendTransferUseCase } from './application/use-cases/send-transfer.use-case';
import { UpdateTransferUseCase } from './application/use-cases/update-transfer.use-case';
import { TransferActorDirectoryPort } from './domain/ports/transfer-actor-directory.port';
import { TransferRepositoryPort } from './domain/ports/transfer.repository.port';
import { TransferActorDirectoryPrismaAdapter } from './infrastructure/adapters/transfer-actor-directory.prisma-adapter';
import { TransferDirectoryAdapter } from './infrastructure/adapters/transfer-directory.adapter';
import { TransferPrismaQueryAdapter } from './infrastructure/persistence/prisma/transfer.prisma-query.adapter';
import { TransferPrismaRepository } from './infrastructure/persistence/prisma/transfer.prisma-repository';
import { TransferController } from './presentation/http/transfer.controller';
import {
  TRANSFER_ACTOR_DIRECTORY,
  TRANSFER_DIRECTORY,
  TRANSFER_OPERATION_REPOSITORY,
  TRANSFER_QUERY,
  TRANSFER_REPOSITORY,
} from './transfer.tokens';

@Module({
  imports: [BodegaModule, InventarioModule],
  controllers: [TransferController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,

    TransferPrismaRepository,
    TransferPrismaQueryAdapter,
    TransferActorDirectoryPrismaAdapter,
    TransferDirectoryAdapter,

    {
      provide: TRANSFER_REPOSITORY,
      useExisting: TransferPrismaRepository,
    },
    {
      provide: TRANSFER_OPERATION_REPOSITORY,
      useExisting: TransferPrismaRepository,
    },
    {
      provide: TRANSFER_QUERY,
      useExisting: TransferPrismaQueryAdapter,
    },
    {
      provide: TRANSFER_ACTOR_DIRECTORY,
      useExisting: TransferActorDirectoryPrismaAdapter,
    },
    {
      provide: TRANSFER_DIRECTORY,
      useExisting: TransferDirectoryAdapter,
    },

    {
      provide: CreateTransferUseCase,
      useFactory: (
        repository: TransferRepositoryPort,
        users: TransferActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        inventory: InventoryAvailabilityPort,
      ) =>
        new CreateTransferUseCase(
          repository,
          users,
          bodegas,
          inventory,
        ),
      inject: [
        TRANSFER_REPOSITORY,
        TRANSFER_ACTOR_DIRECTORY,
        BODEGA_DIRECTORY,
        INVENTORY_AVAILABILITY,
      ],
    },
    {
      provide: UpdateTransferUseCase,
      useFactory: (
        repository: TransferRepositoryPort,
        users: TransferActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        inventory: InventoryAvailabilityPort,
      ) =>
        new UpdateTransferUseCase(
          repository,
          users,
          bodegas,
          inventory,
        ),
      inject: [
        TRANSFER_REPOSITORY,
        TRANSFER_ACTOR_DIRECTORY,
        BODEGA_DIRECTORY,
        INVENTORY_AVAILABILITY,
      ],
    },
    {
      provide: PrepareTransferUseCase,
      useFactory: (
        repository: TransferRepositoryPort,
        users: TransferActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        inventory: InventoryAvailabilityPort,
      ) =>
        new PrepareTransferUseCase(
          repository,
          users,
          bodegas,
          inventory,
        ),
      inject: [
        TRANSFER_REPOSITORY,
        TRANSFER_ACTOR_DIRECTORY,
        BODEGA_DIRECTORY,
        INVENTORY_AVAILABILITY,
      ],
    },
    {
      provide: CancelTransferUseCase,
      useFactory: (
        repository: TransferRepositoryPort,
        operations: TransferOperationRepositoryPort,
        users: TransferActorDirectoryPort,
      ) => new CancelTransferUseCase(repository, operations, users),
      inject: [
        TRANSFER_REPOSITORY,
        TRANSFER_OPERATION_REPOSITORY,
        TRANSFER_ACTOR_DIRECTORY,
      ],
    },
    {
      provide: SendTransferUseCase,
      useFactory: (
        operations: TransferOperationRepositoryPort,
        users: TransferActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        inventory: InventoryOperationsPort,
      ) =>
        new SendTransferUseCase(
          operations,
          users,
          bodegas,
          inventory,
        ),
      inject: [
        TRANSFER_OPERATION_REPOSITORY,
        TRANSFER_ACTOR_DIRECTORY,
        BODEGA_DIRECTORY,
        INVENTORY_OPERATIONS,
      ],
    },
    {
      provide: ReceiveTransferUseCase,
      useFactory: (
        operations: TransferOperationRepositoryPort,
        users: TransferActorDirectoryPort,
        bodegas: BodegaDirectoryPort,
        inventory: InventoryOperationsPort,
      ) =>
        new ReceiveTransferUseCase(
          operations,
          users,
          bodegas,
          inventory,
        ),
      inject: [
        TRANSFER_OPERATION_REPOSITORY,
        TRANSFER_ACTOR_DIRECTORY,
        BODEGA_DIRECTORY,
        INVENTORY_OPERATIONS,
      ],
    },
    {
      provide: ListTransfersUseCase,
      useFactory: (query: TransferQueryPort) =>
        new ListTransfersUseCase(query),
      inject: [TRANSFER_QUERY],
    },
    {
      provide: GetTransferUseCase,
      useFactory: (query: TransferQueryPort) =>
        new GetTransferUseCase(query),
      inject: [TRANSFER_QUERY],
    },
    {
      provide: ListTransferEventsUseCase,
      useFactory: (query: TransferQueryPort) =>
        new ListTransferEventsUseCase(query),
      inject: [TRANSFER_QUERY],
    },
    {
      provide: ListTransferOperationsUseCase,
      useFactory: (query: TransferQueryPort) =>
        new ListTransferOperationsUseCase(query),
      inject: [TRANSFER_QUERY],
    },
    {
      provide: GetTransferSummaryUseCase,
      useFactory: (query: TransferQueryPort) =>
        new GetTransferSummaryUseCase(query),
      inject: [TRANSFER_QUERY],
    },
  ],
  exports: [TRANSFER_DIRECTORY],
})
export class TransferenciasModule {}
