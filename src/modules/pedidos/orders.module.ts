import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { OrderQueryPort } from './application/ports/order-query.port';
import { CancelOrderUseCase } from './application/use-cases/cancel-order.use-case';
import { ConfirmOrderUseCase } from './application/use-cases/confirm-order.use-case';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderSummaryUseCase } from './application/use-cases/get-order-summary.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { ListOrderEventsUseCase } from './application/use-cases/list-order-events.use-case';
import { ListOrdersUseCase } from './application/use-cases/list-orders.use-case';
import { RequestOrderValidationUseCase } from './application/use-cases/request-order-validation.use-case';
import { UpdateOrderUseCase } from './application/use-cases/update-order.use-case';
import { OrderActorDirectoryPort } from './domain/ports/order-actor-directory.port';
import { OrderCustomerDirectoryPort } from './domain/ports/order-customer-directory.port';
import { OrderProductCatalogPort } from './domain/ports/order-product-catalog.port';
import { OrderRepositoryPort } from './domain/ports/order.repository.port';
import { OrderVisitDirectoryPort } from './domain/ports/order-visit-directory.port';
import { OrderActorDirectoryPrismaAdapter } from './infrastructure/adapters/order-actor-directory.prisma-adapter';
import { OrderCreditGateAdapter } from './infrastructure/adapters/order-credit-gate.adapter';
import { OrderCustomerDirectoryPrismaAdapter } from './infrastructure/adapters/order-customer-directory.prisma-adapter';
import { OrderDirectoryAdapter } from './infrastructure/adapters/order-directory.adapter';
import { OrderBillingDirectoryAdapter } from './infrastructure/adapters/order-billing-directory.adapter';
import { OrderDispatchGateAdapter } from './infrastructure/adapters/order-dispatch-gate.adapter';
import { OrderDeliveryGateAdapter } from './infrastructure/adapters/order-delivery-gate.adapter';
import { OrderProductCatalogPrismaAdapter } from './infrastructure/adapters/order-product-catalog.prisma-adapter';
import { OrderVisitDirectoryPrismaAdapter } from './infrastructure/adapters/order-visit-directory.prisma-adapter';
import { OrderPrismaQueryAdapter } from './infrastructure/persistence/prisma/order.prisma-query.adapter';
import { OrderPrismaRepository } from './infrastructure/persistence/prisma/order.prisma-repository';
import {
  ORDER_ACTOR_DIRECTORY,
  ORDER_BILLING_DIRECTORY,
  ORDER_CREDIT_GATE,
  ORDER_CUSTOMER_DIRECTORY,
  ORDER_DIRECTORY,
  ORDER_DISPATCH_GATE,
  ORDER_DELIVERY_GATE,
  ORDER_PRODUCT_CATALOG,
  ORDER_QUERY,
  ORDER_REPOSITORY,
  ORDER_VISIT_DIRECTORY,
} from './order.tokens';
import { OrderController } from './presentation/http/order.controller';

@Module({
  controllers: [OrderController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    OrderPrismaRepository,
    OrderPrismaQueryAdapter,
    OrderActorDirectoryPrismaAdapter,
    OrderCustomerDirectoryPrismaAdapter,
    OrderVisitDirectoryPrismaAdapter,
    OrderProductCatalogPrismaAdapter,
    OrderDirectoryAdapter,
    OrderBillingDirectoryAdapter,
    OrderCreditGateAdapter,
    OrderDispatchGateAdapter,
    OrderDeliveryGateAdapter,

    { provide: ORDER_REPOSITORY, useExisting: OrderPrismaRepository },
    { provide: ORDER_QUERY, useExisting: OrderPrismaQueryAdapter },
    {
      provide: ORDER_ACTOR_DIRECTORY,
      useExisting: OrderActorDirectoryPrismaAdapter,
    },
    {
      provide: ORDER_CUSTOMER_DIRECTORY,
      useExisting: OrderCustomerDirectoryPrismaAdapter,
    },
    {
      provide: ORDER_VISIT_DIRECTORY,
      useExisting: OrderVisitDirectoryPrismaAdapter,
    },
    {
      provide: ORDER_PRODUCT_CATALOG,
      useExisting: OrderProductCatalogPrismaAdapter,
    },
    { provide: ORDER_DIRECTORY, useExisting: OrderDirectoryAdapter },
    { provide: ORDER_BILLING_DIRECTORY, useExisting: OrderBillingDirectoryAdapter },
    { provide: ORDER_CREDIT_GATE, useExisting: OrderCreditGateAdapter },
    { provide: ORDER_DISPATCH_GATE, useExisting: OrderDispatchGateAdapter },
    { provide: ORDER_DELIVERY_GATE, useExisting: OrderDeliveryGateAdapter },

    {
      provide: CreateOrderUseCase,
      useFactory: (
        repository: OrderRepositoryPort,
        users: OrderActorDirectoryPort,
        customers: OrderCustomerDirectoryPort,
        visits: OrderVisitDirectoryPort,
        products: OrderProductCatalogPort,
      ) =>
        new CreateOrderUseCase(
          repository,
          users,
          customers,
          visits,
          products,
        ),
      inject: [
        ORDER_REPOSITORY,
        ORDER_ACTOR_DIRECTORY,
        ORDER_CUSTOMER_DIRECTORY,
        ORDER_VISIT_DIRECTORY,
        ORDER_PRODUCT_CATALOG,
      ],
    },
    {
      provide: UpdateOrderUseCase,
      useFactory: (
        repository: OrderRepositoryPort,
        users: OrderActorDirectoryPort,
        customers: OrderCustomerDirectoryPort,
        visits: OrderVisitDirectoryPort,
        products: OrderProductCatalogPort,
      ) =>
        new UpdateOrderUseCase(
          repository,
          users,
          customers,
          visits,
          products,
        ),
      inject: [
        ORDER_REPOSITORY,
        ORDER_ACTOR_DIRECTORY,
        ORDER_CUSTOMER_DIRECTORY,
        ORDER_VISIT_DIRECTORY,
        ORDER_PRODUCT_CATALOG,
      ],
    },
    {
      provide: RequestOrderValidationUseCase,
      useFactory: (
        repository: OrderRepositoryPort,
        users: OrderActorDirectoryPort,
      ) => new RequestOrderValidationUseCase(repository, users),
      inject: [ORDER_REPOSITORY, ORDER_ACTOR_DIRECTORY],
    },
    {
      provide: ConfirmOrderUseCase,
      useFactory: (
        repository: OrderRepositoryPort,
        users: OrderActorDirectoryPort,
      ) => new ConfirmOrderUseCase(repository, users),
      inject: [ORDER_REPOSITORY, ORDER_ACTOR_DIRECTORY],
    },
    {
      provide: CancelOrderUseCase,
      useFactory: (
        repository: OrderRepositoryPort,
        users: OrderActorDirectoryPort,
      ) => new CancelOrderUseCase(repository, users),
      inject: [ORDER_REPOSITORY, ORDER_ACTOR_DIRECTORY],
    },
    {
      provide: ListOrdersUseCase,
      useFactory: (
        query: OrderQueryPort,
        users: OrderActorDirectoryPort,
      ) => new ListOrdersUseCase(query, users),
      inject: [ORDER_QUERY, ORDER_ACTOR_DIRECTORY],
    },
    {
      provide: GetOrderUseCase,
      useFactory: (
        query: OrderQueryPort,
        users: OrderActorDirectoryPort,
      ) => new GetOrderUseCase(query, users),
      inject: [ORDER_QUERY, ORDER_ACTOR_DIRECTORY],
    },
    {
      provide: ListOrderEventsUseCase,
      useFactory: (
        query: OrderQueryPort,
        users: OrderActorDirectoryPort,
      ) => new ListOrderEventsUseCase(query, users),
      inject: [ORDER_QUERY, ORDER_ACTOR_DIRECTORY],
    },
    {
      provide: GetOrderSummaryUseCase,
      useFactory: (
        query: OrderQueryPort,
        users: OrderActorDirectoryPort,
      ) => new GetOrderSummaryUseCase(query, users),
      inject: [ORDER_QUERY, ORDER_ACTOR_DIRECTORY],
    },
  ],
  exports: [
    ORDER_DIRECTORY,
    ORDER_BILLING_DIRECTORY,
    ORDER_CREDIT_GATE,
    ORDER_DISPATCH_GATE,
    ORDER_DELIVERY_GATE,
    RequestOrderValidationUseCase,
  ],
})
export class PedidosModule {}
