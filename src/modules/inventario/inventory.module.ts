import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { BodegaModule } from '../bodegas/bodega.module';
import { BODEGA_DIRECTORY } from '../bodegas/bodega.tokens';
import { BodegaDirectoryPort } from '../bodegas/application/ports/bodega-directory.port';

import {
  INVENTORY_AVAILABILITY,
  INVENTORY_OPERATIONS,
  INVENTORY_PRODUCT_CATALOG,
  INVENTORY_QUERY,
  INVENTORY_REPOSITORY,
  INVENTORY_USER_DIRECTORY,
} from './inventory.tokens';

import { InventoryQueryPort } from './application/ports/inventory-query.port';
import { InventoryRepositoryPort } from './domain/ports/inventory.repository.port';
import { ProductCatalogPort } from './domain/ports/product-catalog.port';

import { InventoryMutationCoordinator } from './application/use-cases/inventory-mutation.coordinator';
import { ListInventoryUseCase } from './application/use-cases/list-inventory.use-case';
import { GetInventoryStockUseCase } from './application/use-cases/get-inventory-stock.use-case';
import { GetInventorySummaryUseCase } from './application/use-cases/get-inventory-summary.use-case';
import { GetProductAvailabilityUseCase } from './application/use-cases/get-product-availability.use-case';
import { ListInventoryMovementsUseCase } from './application/use-cases/list-inventory-movements.use-case';
import { ListInventoryReservationsUseCase } from './application/use-cases/list-inventory-reservations.use-case';
import { GetInventoryReservationUseCase } from './application/use-cases/get-inventory-reservation.use-case';
import { RegisterInventoryEntryUseCase } from './application/use-cases/register-inventory-entry.use-case';
import { AdjustInventoryUseCase } from './application/use-cases/adjust-inventory.use-case';
import { ReserveInventoryUseCase } from './application/use-cases/reserve-inventory.use-case';
import { ApplyInventoryReservationUseCase } from './application/use-cases/apply-inventory-reservation.use-case';
import { ReleaseInventoryReservationUseCase } from './application/use-cases/release-inventory-reservation.use-case';
import { CancelInventoryReservationUseCase } from './application/use-cases/cancel-inventory-reservation.use-case';
import { RegisterInventoryReturnUseCase } from './application/use-cases/register-inventory-return.use-case';
import { RegisterTransferOutUseCase } from './application/use-cases/register-transfer-out.use-case';
import { RegisterTransferInUseCase } from './application/use-cases/register-transfer-in.use-case';

import { InventoryPrismaRepository } from './infrastructure/persistence/prisma/inventory.prisma-repository';
import { InventoryPrismaQueryAdapter } from './infrastructure/persistence/prisma/inventory.prisma-query.adapter';
import { ProductCatalogPrismaAdapter } from './infrastructure/adapters/product-catalog.prisma-adapter';
import { InventoryUserDirectoryPrismaAdapter } from './infrastructure/adapters/inventory-user-directory.prisma-adapter';
import { InventoryAvailabilityAdapter } from './infrastructure/adapters/inventory-availability.adapter';
import { InventoryOperationsAdapter } from './infrastructure/adapters/inventory-operations.adapter';

import { InventoryController } from './presentation/http/inventory.controller';
import { InventoryRolesGuard } from './presentation/http/security/inventory-roles.guard';

@Module({
  imports: [BodegaModule],
  controllers: [InventoryController],
  providers: [
    PrismaService,

    InventoryPrismaRepository,
    InventoryPrismaQueryAdapter,
    ProductCatalogPrismaAdapter,
    InventoryUserDirectoryPrismaAdapter,

    { provide: INVENTORY_REPOSITORY, useExisting: InventoryPrismaRepository },
    { provide: INVENTORY_QUERY, useExisting: InventoryPrismaQueryAdapter },
    {
      provide: INVENTORY_PRODUCT_CATALOG,
      useExisting: ProductCatalogPrismaAdapter,
    },
    {
      provide: INVENTORY_USER_DIRECTORY,
      useExisting: InventoryUserDirectoryPrismaAdapter,
    },

    {
      provide: InventoryMutationCoordinator,
      useFactory: (
        repository: InventoryRepositoryPort,
        bodegas: BodegaDirectoryPort,
        products: ProductCatalogPort,
      ) => new InventoryMutationCoordinator(repository, bodegas, products),
      inject: [
        INVENTORY_REPOSITORY,
        BODEGA_DIRECTORY,
        INVENTORY_PRODUCT_CATALOG,
      ],
    },

    {
      provide: ListInventoryUseCase,
      useFactory: (query: InventoryQueryPort) =>
        new ListInventoryUseCase(query),
      inject: [INVENTORY_QUERY],
    },
    {
      provide: GetInventoryStockUseCase,
      useFactory: (query: InventoryQueryPort) =>
        new GetInventoryStockUseCase(query),
      inject: [INVENTORY_QUERY],
    },
    {
      provide: GetInventorySummaryUseCase,
      useFactory: (query: InventoryQueryPort) =>
        new GetInventorySummaryUseCase(query),
      inject: [INVENTORY_QUERY],
    },
    {
      provide: GetProductAvailabilityUseCase,
      useFactory: (query: InventoryQueryPort) =>
        new GetProductAvailabilityUseCase(query),
      inject: [INVENTORY_QUERY],
    },
    {
      provide: ListInventoryMovementsUseCase,
      useFactory: (query: InventoryQueryPort) =>
        new ListInventoryMovementsUseCase(query),
      inject: [INVENTORY_QUERY],
    },
    {
      provide: ListInventoryReservationsUseCase,
      useFactory: (query: InventoryQueryPort) =>
        new ListInventoryReservationsUseCase(query),
      inject: [INVENTORY_QUERY],
    },
    {
      provide: GetInventoryReservationUseCase,
      useFactory: (query: InventoryQueryPort) =>
        new GetInventoryReservationUseCase(query),
      inject: [INVENTORY_QUERY],
    },

    {
      provide: RegisterInventoryEntryUseCase,
      useFactory: (coordinator: InventoryMutationCoordinator) =>
        new RegisterInventoryEntryUseCase(coordinator),
      inject: [InventoryMutationCoordinator],
    },
    {
      provide: AdjustInventoryUseCase,
      useFactory: (coordinator: InventoryMutationCoordinator) =>
        new AdjustInventoryUseCase(coordinator),
      inject: [InventoryMutationCoordinator],
    },
    {
      provide: RegisterInventoryReturnUseCase,
      useFactory: (coordinator: InventoryMutationCoordinator) =>
        new RegisterInventoryReturnUseCase(coordinator),
      inject: [InventoryMutationCoordinator],
    },
    {
      provide: RegisterTransferOutUseCase,
      useFactory: (coordinator: InventoryMutationCoordinator) =>
        new RegisterTransferOutUseCase(coordinator),
      inject: [InventoryMutationCoordinator],
    },
    {
      provide: RegisterTransferInUseCase,
      useFactory: (coordinator: InventoryMutationCoordinator) =>
        new RegisterTransferInUseCase(coordinator),
      inject: [InventoryMutationCoordinator],
    },
    {
      provide: ReserveInventoryUseCase,
      useFactory: (
        repository: InventoryRepositoryPort,
        bodegas: BodegaDirectoryPort,
        products: ProductCatalogPort,
        coordinator: InventoryMutationCoordinator,
      ) =>
        new ReserveInventoryUseCase(
          repository,
          bodegas,
          products,
          coordinator,
        ),
      inject: [
        INVENTORY_REPOSITORY,
        BODEGA_DIRECTORY,
        INVENTORY_PRODUCT_CATALOG,
        InventoryMutationCoordinator,
      ],
    },
    {
      provide: ApplyInventoryReservationUseCase,
      useFactory: (
        repository: InventoryRepositoryPort,
        coordinator: InventoryMutationCoordinator,
      ) => new ApplyInventoryReservationUseCase(repository, coordinator),
      inject: [INVENTORY_REPOSITORY, InventoryMutationCoordinator],
    },
    {
      provide: ReleaseInventoryReservationUseCase,
      useFactory: (
        repository: InventoryRepositoryPort,
        coordinator: InventoryMutationCoordinator,
      ) => new ReleaseInventoryReservationUseCase(repository, coordinator),
      inject: [INVENTORY_REPOSITORY, InventoryMutationCoordinator],
    },
    {
      provide: CancelInventoryReservationUseCase,
      useFactory: (
        repository: InventoryRepositoryPort,
        coordinator: InventoryMutationCoordinator,
      ) => new CancelInventoryReservationUseCase(repository, coordinator),
      inject: [INVENTORY_REPOSITORY, InventoryMutationCoordinator],
    },

    InventoryAvailabilityAdapter,
    InventoryOperationsAdapter,
    {
      provide: INVENTORY_AVAILABILITY,
      useExisting: InventoryAvailabilityAdapter,
    },
    {
      provide: INVENTORY_OPERATIONS,
      useExisting: InventoryOperationsAdapter,
    },

    InventoryRolesGuard,
  ],
  exports: [INVENTORY_AVAILABILITY, INVENTORY_OPERATIONS],
})
export class InventarioModule {}
