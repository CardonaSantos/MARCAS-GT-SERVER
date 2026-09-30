import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateBodegaUseCase } from './application/use-cases/create-bodega.use-case';
import { UpdateBodegaUseCase } from './application/use-cases/update-bodega.use-case';
import { AssignBodegaResponsibleUseCase } from './application/use-cases/assign-bodega-responsible.use-case';
import { ActivateBodegaUseCase } from './application/use-cases/activate-bodega.use-case';
import { DeactivateBodegaUseCase } from './application/use-cases/deactivate-bodega.use-case';
import { SetPrincipalBodegaUseCase } from './application/use-cases/set-principal-bodega.use-case';
import { GetBodegaUseCase } from './application/use-cases/get-bodega.use-case';
import { GetPrincipalBodegaUseCase } from './application/use-cases/get-principal-bodega.use-case';
import { ListBodegasUseCase } from './application/use-cases/list-bodegas.use-case';
import { ListBodegaSelectablesUseCase } from './application/use-cases/list-bodega-selectables.use-case';
import { ListBodegaEventsUseCase } from './application/use-cases/list-bodega-events.use-case';
import { GetBodegaOverviewUseCase } from './application/use-cases/get-bodega-overview.use-case';
import {
  BODEGA_COMPANY_CONTEXT,
  BODEGA_DIRECTORY,
  BODEGA_OPERATIONAL_DEPENDENCIES,
  BODEGA_QUERY,
  BODEGA_REPOSITORY,
  BODEGA_USER_DIRECTORY,
} from './bodega.tokens';
import { BodegaCompanyContextPort } from './domain/ports/bodega-company-context.port';
import { BodegaOperationalDependenciesPort } from './domain/ports/bodega-operational-dependencies.port';
import { BodegaRepositoryPort } from './domain/ports/bodega.repository.port';
import { BodegaUserDirectoryPort } from './domain/ports/bodega-user-directory.port';
import { BodegaCompanyContextPrismaAdapter } from './infrastructure/adapters/bodega-company-context.prisma-adapter';
import { BodegaDirectoryAdapter } from './infrastructure/adapters/bodega-directory.adapter';
import { BodegaOperationalDependenciesPrismaAdapter } from './infrastructure/adapters/bodega-operational-dependencies.prisma-adapter';
import { BodegaUserDirectoryPrismaAdapter } from './infrastructure/adapters/bodega-user-directory.prisma-adapter';
import { BodegaPrismaQueryAdapter } from './infrastructure/persistence/prisma/bodega.prisma-query.adapter';
import { BodegaPrismaRepository } from './infrastructure/persistence/prisma/bodega.prisma-repository';
import { BodegaController } from './presentation/http/bodega.controller';
import { BodegaRolesGuard } from './presentation/http/security/bodega-roles.guard';
import { BodegaQueryPort } from './application/ports/bodega-query.port';

@Module({
  controllers: [BodegaController],
  providers: [
    PrismaService,
    BodegaPrismaRepository,
    BodegaPrismaQueryAdapter,
    BodegaCompanyContextPrismaAdapter,
    BodegaUserDirectoryPrismaAdapter,
    BodegaOperationalDependenciesPrismaAdapter,
    BodegaDirectoryAdapter,

    { provide: BODEGA_REPOSITORY, useExisting: BodegaPrismaRepository },
    { provide: BODEGA_QUERY, useExisting: BodegaPrismaQueryAdapter },
    {
      provide: BODEGA_COMPANY_CONTEXT,
      useExisting: BodegaCompanyContextPrismaAdapter,
    },
    {
      provide: BODEGA_USER_DIRECTORY,
      useExisting: BodegaUserDirectoryPrismaAdapter,
    },
    {
      provide: BODEGA_OPERATIONAL_DEPENDENCIES,
      useExisting: BodegaOperationalDependenciesPrismaAdapter,
    },
    { provide: BODEGA_DIRECTORY, useExisting: BodegaDirectoryAdapter },

    {
      provide: CreateBodegaUseCase,
      useFactory: (
        repository: BodegaRepositoryPort,
        companyContext: BodegaCompanyContextPort,
        users: BodegaUserDirectoryPort,
      ) => new CreateBodegaUseCase(repository, companyContext, users),
      inject: [
        BODEGA_REPOSITORY,
        BODEGA_COMPANY_CONTEXT,
        BODEGA_USER_DIRECTORY,
      ],
    },
    {
      provide: UpdateBodegaUseCase,
      useFactory: (repository: BodegaRepositoryPort) =>
        new UpdateBodegaUseCase(repository),
      inject: [BODEGA_REPOSITORY],
    },
    {
      provide: AssignBodegaResponsibleUseCase,
      useFactory: (
        repository: BodegaRepositoryPort,
        users: BodegaUserDirectoryPort,
      ) => new AssignBodegaResponsibleUseCase(repository, users),
      inject: [BODEGA_REPOSITORY, BODEGA_USER_DIRECTORY],
    },
    {
      provide: ActivateBodegaUseCase,
      useFactory: (repository: BodegaRepositoryPort) =>
        new ActivateBodegaUseCase(repository),
      inject: [BODEGA_REPOSITORY],
    },
    {
      provide: DeactivateBodegaUseCase,
      useFactory: (
        repository: BodegaRepositoryPort,
        dependencies: BodegaOperationalDependenciesPort,
      ) => new DeactivateBodegaUseCase(repository, dependencies),
      inject: [BODEGA_REPOSITORY, BODEGA_OPERATIONAL_DEPENDENCIES],
    },
    {
      provide: SetPrincipalBodegaUseCase,
      useFactory: (repository: BodegaRepositoryPort) =>
        new SetPrincipalBodegaUseCase(repository),
      inject: [BODEGA_REPOSITORY],
    },
    {
      provide: GetBodegaUseCase,
      useFactory: (query: BodegaQueryPort) => new GetBodegaUseCase(query),
      inject: [BODEGA_QUERY],
    },
    {
      provide: GetPrincipalBodegaUseCase,
      useFactory: (query: BodegaQueryPort) =>
        new GetPrincipalBodegaUseCase(query),
      inject: [BODEGA_QUERY],
    },
    {
      provide: ListBodegasUseCase,
      useFactory: (query: BodegaQueryPort) => new ListBodegasUseCase(query),
      inject: [BODEGA_QUERY],
    },
    {
      provide: ListBodegaSelectablesUseCase,
      useFactory: (query: BodegaQueryPort) =>
        new ListBodegaSelectablesUseCase(query),
      inject: [BODEGA_QUERY],
    },
    {
      provide: ListBodegaEventsUseCase,
      useFactory: (
        repository: BodegaRepositoryPort,
        query: BodegaQueryPort,
      ) => new ListBodegaEventsUseCase(repository, query),
      inject: [BODEGA_REPOSITORY, BODEGA_QUERY],
    },
    {
      provide: GetBodegaOverviewUseCase,
      useFactory: (query: BodegaQueryPort) =>
        new GetBodegaOverviewUseCase(query),
      inject: [BODEGA_QUERY],
    },

    BodegaRolesGuard,
  ],
  exports: [BODEGA_DIRECTORY],
})
export class BodegaModule {}
