import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import {
  BodegaDirectoryPort,
  BodegaModule,
  BODEGA_DIRECTORY,
} from '../bodegas';
import {
  DespachosModule,
  DispatchDirectoryPort,
  DISPATCH_DIRECTORY,
} from '../despachos';
import {
  TrackingDirectoryPort,
  TrackingModule,
  TRACKING_DIRECTORY,
} from '../tracking';
import { TransportCatalogRepositoryPort } from './domain/ports/transport-catalog.repository.port';
import { TransportWorkflowPort } from './domain/ports/transport-workflow.port';
import { TransportActorDirectoryPort } from './application/ports/transport-actor-directory.port';
import { TransportQueryPort } from './application/ports/transport-query.port';
import { CreateShipmentUseCase } from './application/use-cases/create-shipment.use-case';
import { AssignShipmentUseCase } from './application/use-cases/assign-shipment.use-case';
import { ConfirmShipmentLoadUseCase } from './application/use-cases/confirm-shipment-load.use-case';
import {
  StartShipmentRouteUseCase,
  CancelShipmentUseCase,
  ReportShipmentIncidentUseCase,
  ResolveShipmentIncidentUseCase,
} from './application/use-cases/workflow.use-cases';
import {
  GetShipmentUseCase,
  GetTransportOperationalReportUseCase,
  GetTransportSummaryUseCase,
  ListShipmentCandidatesUseCase,
  ListShipmentsUseCase,
} from './application/use-cases/read.use-cases';
import {
  CreateCarrierUseCase,
  CreateDriverUseCase,
  CreateVehicleUseCase,
  DeactivateTransportResourceUseCase,
  ListTransportCatalogUseCase,
} from './application/use-cases/catalog.use-cases';
import { TransportActorDirectoryPrismaAdapter } from './infrastructure/adapters/transport-actor-directory.prisma-adapter';
import { TransportDirectoryAdapter } from './infrastructure/adapters/transport-directory.adapter';
import { TransportDeliveryGateAdapter } from './infrastructure/adapters/transport-delivery-gate.adapter';
import { TransportCatalogPrismaRepository } from './infrastructure/persistence/prisma/transport-catalog.prisma-repository';
import { TransportPrismaQueryAdapter } from './infrastructure/persistence/prisma/transport.prisma-query.adapter';
import { TransportWorkflowPrismaAdapter } from './infrastructure/persistence/prisma/transport-workflow.prisma-adapter';
import {
  CarrierController,
  DriverController,
  VehicleController,
} from './presentation/http/catalog.controller';
import { TransportController } from './presentation/http/transport.controller';
import {
  TRANSPORT_ACTOR_DIRECTORY,
  TRANSPORT_CATALOG_REPOSITORY,
  TRANSPORT_DELIVERY_GATE,
  TRANSPORT_DIRECTORY,
  TRANSPORT_QUERY,
  TRANSPORT_WORKFLOW,
} from './transport.tokens';

@Module({
  imports: [BodegaModule, DespachosModule, TrackingModule],
  controllers: [
    TransportController,
    CarrierController,
    VehicleController,
    DriverController,
  ],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    TransportActorDirectoryPrismaAdapter,
    TransportDirectoryAdapter,
    TransportDeliveryGateAdapter,
    TransportCatalogPrismaRepository,
    TransportPrismaQueryAdapter,
    TransportWorkflowPrismaAdapter,
    {
      provide: TRANSPORT_ACTOR_DIRECTORY,
      useExisting: TransportActorDirectoryPrismaAdapter,
    },
    { provide: TRANSPORT_DIRECTORY, useExisting: TransportDirectoryAdapter },
    {
      provide: TRANSPORT_DELIVERY_GATE,
      useExisting: TransportDeliveryGateAdapter,
    },
    {
      provide: TRANSPORT_CATALOG_REPOSITORY,
      useExisting: TransportCatalogPrismaRepository,
    },
    { provide: TRANSPORT_QUERY, useExisting: TransportPrismaQueryAdapter },
    {
      provide: TRANSPORT_WORKFLOW,
      useExisting: TransportWorkflowPrismaAdapter,
    },
    {
      provide: CreateShipmentUseCase,
      useFactory: (
        w: TransportWorkflowPort,
        a: TransportActorDirectoryPort,
        b: BodegaDirectoryPort,
        d: DispatchDirectoryPort,
      ) => new CreateShipmentUseCase(w, a, b, d),
      inject: [
        TRANSPORT_WORKFLOW,
        TRANSPORT_ACTOR_DIRECTORY,
        BODEGA_DIRECTORY,
        DISPATCH_DIRECTORY,
      ],
    },
    {
      provide: AssignShipmentUseCase,
      useFactory: (
        w: TransportWorkflowPort,
        c: TransportCatalogRepositoryPort,
        q: TransportQueryPort,
        a: TransportActorDirectoryPort,
      ) => new AssignShipmentUseCase(w, c, q, a),
      inject: [
        TRANSPORT_WORKFLOW,
        TRANSPORT_CATALOG_REPOSITORY,
        TRANSPORT_QUERY,
        TRANSPORT_ACTOR_DIRECTORY,
      ],
    },
    {
      provide: ConfirmShipmentLoadUseCase,
      useFactory: (
        w: TransportWorkflowPort,
        q: TransportQueryPort,
        a: TransportActorDirectoryPort,
        d: DispatchDirectoryPort,
      ) => new ConfirmShipmentLoadUseCase(w, q, a, d),
      inject: [
        TRANSPORT_WORKFLOW,
        TRANSPORT_QUERY,
        TRANSPORT_ACTOR_DIRECTORY,
        DISPATCH_DIRECTORY,
      ],
    },
    {
      provide: StartShipmentRouteUseCase,
      useFactory: (
        w: TransportWorkflowPort,
        q: TransportQueryPort,
        a: TransportActorDirectoryPort,
      ) => new StartShipmentRouteUseCase(w, q, a),
      inject: [TRANSPORT_WORKFLOW, TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: CancelShipmentUseCase,
      useFactory: (
        w: TransportWorkflowPort,
        q: TransportQueryPort,
        a: TransportActorDirectoryPort,
      ) => new CancelShipmentUseCase(w, q, a),
      inject: [TRANSPORT_WORKFLOW, TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: ReportShipmentIncidentUseCase,
      useFactory: (
        w: TransportWorkflowPort,
        q: TransportQueryPort,
        a: TransportActorDirectoryPort,
      ) => new ReportShipmentIncidentUseCase(w, q, a),
      inject: [TRANSPORT_WORKFLOW, TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: ResolveShipmentIncidentUseCase,
      useFactory: (
        w: TransportWorkflowPort,
        q: TransportQueryPort,
        a: TransportActorDirectoryPort,
      ) => new ResolveShipmentIncidentUseCase(w, q, a),
      inject: [TRANSPORT_WORKFLOW, TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: ListShipmentsUseCase,
      useFactory: (q: TransportQueryPort, a: TransportActorDirectoryPort) =>
        new ListShipmentsUseCase(q, a),
      inject: [TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: GetShipmentUseCase,
      useFactory: (
        q: TransportQueryPort,
        a: TransportActorDirectoryPort,
        t: TrackingDirectoryPort,
      ) => new GetShipmentUseCase(q, a, t),
      inject: [TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY, TRACKING_DIRECTORY],
    },
    {
      provide: ListShipmentCandidatesUseCase,
      useFactory: (q: TransportQueryPort, a: TransportActorDirectoryPort) =>
        new ListShipmentCandidatesUseCase(q, a),
      inject: [TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: GetTransportSummaryUseCase,
      useFactory: (q: TransportQueryPort, a: TransportActorDirectoryPort) =>
        new GetTransportSummaryUseCase(q, a),
      inject: [TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: GetTransportOperationalReportUseCase,
      useFactory: (q: TransportQueryPort, a: TransportActorDirectoryPort) =>
        new GetTransportOperationalReportUseCase(q, a),
      inject: [TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: CreateCarrierUseCase,
      useFactory: (
        r: TransportCatalogRepositoryPort,
        a: TransportActorDirectoryPort,
      ) => new CreateCarrierUseCase(r, a),
      inject: [TRANSPORT_CATALOG_REPOSITORY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: CreateVehicleUseCase,
      useFactory: (
        r: TransportCatalogRepositoryPort,
        a: TransportActorDirectoryPort,
      ) => new CreateVehicleUseCase(r, a),
      inject: [TRANSPORT_CATALOG_REPOSITORY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: CreateDriverUseCase,
      useFactory: (
        r: TransportCatalogRepositoryPort,
        a: TransportActorDirectoryPort,
      ) => new CreateDriverUseCase(r, a),
      inject: [TRANSPORT_CATALOG_REPOSITORY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: DeactivateTransportResourceUseCase,
      useFactory: (
        r: TransportCatalogRepositoryPort,
        a: TransportActorDirectoryPort,
      ) => new DeactivateTransportResourceUseCase(r, a),
      inject: [TRANSPORT_CATALOG_REPOSITORY, TRANSPORT_ACTOR_DIRECTORY],
    },
    {
      provide: ListTransportCatalogUseCase,
      useFactory: (q: TransportQueryPort, a: TransportActorDirectoryPort) =>
        new ListTransportCatalogUseCase(q, a),
      inject: [TRANSPORT_QUERY, TRANSPORT_ACTOR_DIRECTORY],
    },
  ],
  exports: [TRANSPORT_DIRECTORY, TRANSPORT_DELIVERY_GATE],
})
export class TransporteModule {}
