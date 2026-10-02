import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import {
  DespachosModule,
  DispatchDirectoryPort,
  DISPATCH_DIRECTORY,
} from '../despachos';
import {
  ORDER_DELIVERY_GATE,
  OrderDeliveryGatePort,
  PedidosModule,
} from '../pedidos';
import {
  TRANSPORT_DELIVERY_GATE,
  TRANSPORT_DIRECTORY,
  TransportDeliveryGatePort,
  TransportDirectoryPort,
  TransporteModule,
} from '../transporte';
import {
  TRACKING_DIRECTORY,
  TrackingDirectoryPort,
  TrackingModule,
} from '../tracking';
import { DeliveryRepositoryPort } from './domain/ports/delivery.repository.port';
import { DeliveryActorDirectoryPort } from './application/ports/delivery-actor-directory.port';
import {
  DeliveryDirectoryPort,
  DeliveryQueryPort,
} from './application/ports/delivery-query.port';
import { DeliveryEvidenceStoragePort } from './application/ports/delivery-evidence-storage.port';
import { CreateDeliveryUseCase } from './application/use-cases/create-delivery.use-case';
import { StartDeliveryUseCase } from './application/use-cases/start-delivery.use-case';
import { UpdateDeliveryResultUseCase } from './application/use-cases/update-delivery-result.use-case';
import {
  AddDeliveryEvidenceUseCase,
  RemoveDeliveryEvidenceUseCase,
} from './application/use-cases/evidence.use-cases';
import { FinalizeDeliveryUseCase } from './application/use-cases/finalize-delivery.use-case';
import { AddDeliveryObservationUseCase } from './application/use-cases/add-delivery-observation.use-case';
import {
  GetDeliveryOperationalReportUseCase,
  GetDeliverySummaryUseCase,
  GetDeliveryUseCase,
  ListDeliveriesUseCase,
  ListDeliveryCandidatesUseCase,
  ListDeliveryEventsUseCase,
  ListDeliveryEvidenceUseCase,
} from './application/use-cases/read.use-cases';
import { DeliveryActorDirectoryPrismaAdapter } from './infrastructure/adapters/delivery-actor-directory.prisma-adapter';
import { DeliveryEvidenceCloudinaryAdapter } from './infrastructure/adapters/delivery-evidence.cloudinary-adapter';
import { DeliveryPrismaRepository } from './infrastructure/persistence/prisma/delivery.prisma-repository';
import { DeliveryPrismaQueryAdapter } from './infrastructure/persistence/prisma/delivery.prisma-query.adapter';
import { DeliveryController } from './presentation/http/delivery.controller';
import {
  DELIVERY_ACTOR_DIRECTORY,
  DELIVERY_DIRECTORY,
  DELIVERY_EVIDENCE_STORAGE,
  DELIVERY_QUERY,
  DELIVERY_REPOSITORY,
} from './delivery.tokens';

@Module({
  imports: [PedidosModule, DespachosModule, TransporteModule, TrackingModule],
  controllers: [DeliveryController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    DeliveryPrismaRepository,
    DeliveryPrismaQueryAdapter,
    DeliveryActorDirectoryPrismaAdapter,
    DeliveryEvidenceCloudinaryAdapter,

    { provide: DELIVERY_REPOSITORY, useExisting: DeliveryPrismaRepository },
    { provide: DELIVERY_QUERY, useExisting: DeliveryPrismaQueryAdapter },
    { provide: DELIVERY_DIRECTORY, useExisting: DeliveryPrismaQueryAdapter },
    { provide: DELIVERY_ACTOR_DIRECTORY, useExisting: DeliveryActorDirectoryPrismaAdapter },
    { provide: DELIVERY_EVIDENCE_STORAGE, useExisting: DeliveryEvidenceCloudinaryAdapter },

    {
      provide: CreateDeliveryUseCase,
      useFactory: (
        repository: DeliveryRepositoryPort,
        actors: DeliveryActorDirectoryPort,
        transport: TransportDirectoryPort,
        dispatches: DispatchDirectoryPort,
      ) => new CreateDeliveryUseCase(repository, actors, transport, dispatches),
      inject: [DELIVERY_REPOSITORY, DELIVERY_ACTOR_DIRECTORY, TRANSPORT_DIRECTORY, DISPATCH_DIRECTORY],
    },
    {
      provide: StartDeliveryUseCase,
      useFactory: (
        repository: DeliveryRepositoryPort,
        actors: DeliveryActorDirectoryPort,
        transport: TransportDirectoryPort,
        dispatches: DispatchDirectoryPort,
      ) => new StartDeliveryUseCase(repository, actors, transport, dispatches),
      inject: [DELIVERY_REPOSITORY, DELIVERY_ACTOR_DIRECTORY, TRANSPORT_DIRECTORY, DISPATCH_DIRECTORY],
    },
    {
      provide: UpdateDeliveryResultUseCase,
      useFactory: (
        repository: DeliveryRepositoryPort,
        actors: DeliveryActorDirectoryPort,
        transport: TransportDirectoryPort,
        dispatches: DispatchDirectoryPort,
      ) => new UpdateDeliveryResultUseCase(repository, actors, transport, dispatches),
      inject: [DELIVERY_REPOSITORY, DELIVERY_ACTOR_DIRECTORY, TRANSPORT_DIRECTORY, DISPATCH_DIRECTORY],
    },
    {
      provide: AddDeliveryEvidenceUseCase,
      useFactory: (
        repository: DeliveryRepositoryPort,
        actors: DeliveryActorDirectoryPort,
        transport: TransportDirectoryPort,
        dispatches: DispatchDirectoryPort,
        storage: DeliveryEvidenceStoragePort,
      ) => new AddDeliveryEvidenceUseCase(repository, actors, transport, dispatches, storage),
      inject: [DELIVERY_REPOSITORY, DELIVERY_ACTOR_DIRECTORY, TRANSPORT_DIRECTORY, DISPATCH_DIRECTORY, DELIVERY_EVIDENCE_STORAGE],
    },
    {
      provide: RemoveDeliveryEvidenceUseCase,
      useFactory: (
        repository: DeliveryRepositoryPort,
        actors: DeliveryActorDirectoryPort,
        transport: TransportDirectoryPort,
        dispatches: DispatchDirectoryPort,
        storage: DeliveryEvidenceStoragePort,
      ) => new RemoveDeliveryEvidenceUseCase(repository, actors, transport, dispatches, storage),
      inject: [DELIVERY_REPOSITORY, DELIVERY_ACTOR_DIRECTORY, TRANSPORT_DIRECTORY, DISPATCH_DIRECTORY, DELIVERY_EVIDENCE_STORAGE],
    },
    {
      provide: FinalizeDeliveryUseCase,
      useFactory: (
        repository: DeliveryRepositoryPort,
        actors: DeliveryActorDirectoryPort,
        transport: TransportDirectoryPort,
        dispatches: DispatchDirectoryPort,
        orders: OrderDeliveryGatePort,
        transportGate: TransportDeliveryGatePort,
      ) => new FinalizeDeliveryUseCase(repository, actors, transport, dispatches, orders, transportGate),
      inject: [DELIVERY_REPOSITORY, DELIVERY_ACTOR_DIRECTORY, TRANSPORT_DIRECTORY, DISPATCH_DIRECTORY, ORDER_DELIVERY_GATE, TRANSPORT_DELIVERY_GATE],
    },
    {
      provide: AddDeliveryObservationUseCase,
      useFactory: (
        repository: DeliveryRepositoryPort,
        actors: DeliveryActorDirectoryPort,
        transport: TransportDirectoryPort,
        dispatches: DispatchDirectoryPort,
      ) => new AddDeliveryObservationUseCase(repository, actors, transport, dispatches),
      inject: [DELIVERY_REPOSITORY, DELIVERY_ACTOR_DIRECTORY, TRANSPORT_DIRECTORY, DISPATCH_DIRECTORY],
    },
    {
      provide: ListDeliveriesUseCase,
      useFactory: (query: DeliveryQueryPort, actors: DeliveryActorDirectoryPort) => new ListDeliveriesUseCase(query, actors),
      inject: [DELIVERY_QUERY, DELIVERY_ACTOR_DIRECTORY],
    },
    {
      provide: ListDeliveryCandidatesUseCase,
      useFactory: (query: DeliveryQueryPort, actors: DeliveryActorDirectoryPort) => new ListDeliveryCandidatesUseCase(query, actors),
      inject: [DELIVERY_QUERY, DELIVERY_ACTOR_DIRECTORY],
    },
    {
      provide: GetDeliveryUseCase,
      useFactory: (query: DeliveryQueryPort, actors: DeliveryActorDirectoryPort, tracking: TrackingDirectoryPort) => new GetDeliveryUseCase(query, actors, tracking),
      inject: [DELIVERY_QUERY, DELIVERY_ACTOR_DIRECTORY, TRACKING_DIRECTORY],
    },
    {
      provide: ListDeliveryEventsUseCase,
      useFactory: (query: DeliveryQueryPort, actors: DeliveryActorDirectoryPort) => new ListDeliveryEventsUseCase(query, actors),
      inject: [DELIVERY_QUERY, DELIVERY_ACTOR_DIRECTORY],
    },
    {
      provide: ListDeliveryEvidenceUseCase,
      useFactory: (query: DeliveryQueryPort, actors: DeliveryActorDirectoryPort) => new ListDeliveryEvidenceUseCase(query, actors),
      inject: [DELIVERY_QUERY, DELIVERY_ACTOR_DIRECTORY],
    },
    {
      provide: GetDeliverySummaryUseCase,
      useFactory: (query: DeliveryQueryPort, actors: DeliveryActorDirectoryPort) => new GetDeliverySummaryUseCase(query, actors),
      inject: [DELIVERY_QUERY, DELIVERY_ACTOR_DIRECTORY],
    },
    {
      provide: GetDeliveryOperationalReportUseCase,
      useFactory: (query: DeliveryQueryPort, actors: DeliveryActorDirectoryPort) => new GetDeliveryOperationalReportUseCase(query, actors),
      inject: [DELIVERY_QUERY, DELIVERY_ACTOR_DIRECTORY],
    },
  ],
  exports: [DELIVERY_DIRECTORY],
})
export class EntregasModule {}
