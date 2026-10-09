import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import {
  ORDER_CREDIT_GATE,
  ORDER_DIRECTORY,
  OrderCreditGatePort,
  OrderDirectoryPort,
  PedidosModule,
} from '../pedidos';
import { RequestOrderValidationUseCase } from '../pedidos/application/use-cases/request-order-validation.use-case';
import { CreditAuthorizationPort } from './application/ports/credit-authorization.port';
import { CreditDirectoryPort } from './application/ports/credit-directory.port';
import { CreditQueryPort } from './application/ports/credit-query.port';
import { ApproveCreditWithScheduleUseCase } from './application/use-cases/approve-credit-with-schedule.use-case';
import { CreditApplicationCommands } from './application/use-cases/credit-application.commands';
import {
  CreditDecisionCommands,
  CreditOrderIntegrationService,
} from './application/use-cases/credit-decision.commands';
import { CreditEvidenceCommands } from './application/use-cases/credit-evidence.commands';
import { CreditPolicyCommands } from './application/use-cases/credit-policy.commands';
import { CreditPaymentPlanCommands } from './application/use-cases/credit-payment-plan.commands';
import { CreditQueries } from './application/use-cases/credit-queries';
import { CreditActorDirectoryPort } from './domain/ports/credit-actor-directory.port';
import {
  CreditApplicationRepositoryPort,
  CreditDecisionRepositoryPort,
  CreditEvidenceRepositoryPort,
  CreditIntegrationRepositoryPort,
  CreditPolicyRepositoryPort,
  CreditPaymentPlanRepositoryPort,
} from './domain/ports/credit.repositories';
import { CreditActorDirectoryPrismaAdapter } from './infrastructure/adapters/credit-actor-directory.prisma-adapter';
import { CreditAuthorizationAdapter } from './infrastructure/adapters/credit-authorization.adapter';
import { CreditDirectoryAdapter } from './infrastructure/adapters/credit-directory.adapter';
import { CreditPolicyPrismaRepository } from './infrastructure/persistence/prisma/credit-policy.prisma-repository';
import { CreditPaymentPlanPrismaRepository } from './infrastructure/persistence/prisma/credit-payment-plan.prisma-repository';
import { CreditPrismaQueryAdapter } from './infrastructure/persistence/prisma/credit.prisma-query.adapter';
import { CreditPrismaRepository } from './infrastructure/persistence/prisma/credit.prisma-repository';
import {
  CREDIT_ACTOR_DIRECTORY,
  CREDIT_APPLICATION_REPOSITORY,
  CREDIT_AUTHORIZATION,
  CREDIT_DECISION_REPOSITORY,
  CREDIT_DIRECTORY,
  CREDIT_EVIDENCE_REPOSITORY,
  CREDIT_INTEGRATION_REPOSITORY,
  CREDIT_POLICY_REPOSITORY,
  CREDIT_PAYMENT_PLAN_REPOSITORY,
  CREDIT_QUERY,
} from './credit.tokens';
import { CreditController } from './presentation/http/credit.controller';
import { CreditPolicyController } from './presentation/http/credit-policy.controller';
import { CreditPortfolioController } from './presentation/http/credit-portfolio.controller';

@Module({
  imports: [PedidosModule],
  controllers: [
    CreditController,
    CreditPolicyController,
    CreditPortfolioController,
  ],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    CreditPrismaRepository,
    CreditPolicyPrismaRepository,
    CreditPaymentPlanPrismaRepository,
    CreditPrismaQueryAdapter,
    CreditActorDirectoryPrismaAdapter,
    CreditDirectoryAdapter,
    CreditAuthorizationAdapter,

    {
      provide: CREDIT_APPLICATION_REPOSITORY,
      useExisting: CreditPrismaRepository,
    },
    {
      provide: CREDIT_EVIDENCE_REPOSITORY,
      useExisting: CreditPrismaRepository,
    },
    {
      provide: CREDIT_DECISION_REPOSITORY,
      useExisting: CreditPrismaRepository,
    },
    {
      provide: CREDIT_INTEGRATION_REPOSITORY,
      useExisting: CreditPrismaRepository,
    },
    {
      provide: CREDIT_POLICY_REPOSITORY,
      useExisting: CreditPolicyPrismaRepository,
    },
    {
      provide: CREDIT_PAYMENT_PLAN_REPOSITORY,
      useExisting: CreditPaymentPlanPrismaRepository,
    },
    { provide: CREDIT_QUERY, useExisting: CreditPrismaQueryAdapter },
    {
      provide: CREDIT_ACTOR_DIRECTORY,
      useExisting: CreditActorDirectoryPrismaAdapter,
    },
    { provide: CREDIT_DIRECTORY, useExisting: CreditDirectoryAdapter },
    { provide: CREDIT_AUTHORIZATION, useExisting: CreditAuthorizationAdapter },

    {
      provide: CreditOrderIntegrationService,
      useFactory: (
        integrations: CreditIntegrationRepositoryPort,
        gate: OrderCreditGatePort,
      ) => new CreditOrderIntegrationService(integrations, gate),
      inject: [CREDIT_INTEGRATION_REPOSITORY, ORDER_CREDIT_GATE],
    },
    {
      provide: CreditApplicationCommands,
      useFactory: (
        repository: CreditApplicationRepositoryPort,
        decisions: CreditDecisionRepositoryPort,
        integrations: CreditIntegrationRepositoryPort,
        policies: CreditPolicyRepositoryPort,
        users: CreditActorDirectoryPort,
        orders: OrderDirectoryPort,
        integration: CreditOrderIntegrationService,
        validateOrder: RequestOrderValidationUseCase,
      ) =>
        new CreditApplicationCommands(
          repository,
          decisions,
          integrations,
          policies,
          users,
          orders,
          integration,
          validateOrder,
        ),
      inject: [
        CREDIT_APPLICATION_REPOSITORY,
        CREDIT_DECISION_REPOSITORY,
        CREDIT_INTEGRATION_REPOSITORY,
        CREDIT_POLICY_REPOSITORY,
        CREDIT_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
        CreditOrderIntegrationService,
        RequestOrderValidationUseCase,
      ],
    },
    {
      provide: CreditEvidenceCommands,
      useFactory: (
        applications: CreditApplicationRepositoryPort,
        evidence: CreditEvidenceRepositoryPort,
        users: CreditActorDirectoryPort,
        orders: OrderDirectoryPort,
      ) => new CreditEvidenceCommands(applications, evidence, users, orders),
      inject: [
        CREDIT_APPLICATION_REPOSITORY,
        CREDIT_EVIDENCE_REPOSITORY,
        CREDIT_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
      ],
    },
    {
      provide: CreditDecisionCommands,
      useFactory: (
        applications: CreditApplicationRepositoryPort,
        evidence: CreditEvidenceRepositoryPort,
        decisions: CreditDecisionRepositoryPort,
        policies: CreditPolicyRepositoryPort,
        users: CreditActorDirectoryPort,
        orders: OrderDirectoryPort,
        integration: CreditOrderIntegrationService,
      ) =>
        new CreditDecisionCommands(
          applications,
          evidence,
          decisions,
          policies,
          users,
          orders,
          integration,
        ),
      inject: [
        CREDIT_APPLICATION_REPOSITORY,
        CREDIT_EVIDENCE_REPOSITORY,
        CREDIT_DECISION_REPOSITORY,
        CREDIT_POLICY_REPOSITORY,
        CREDIT_ACTOR_DIRECTORY,
        ORDER_DIRECTORY,
        CreditOrderIntegrationService,
      ],
    },
    {
      provide: CreditPaymentPlanCommands,
      useFactory: (
        plans: CreditPaymentPlanRepositoryPort,
        users: CreditActorDirectoryPort,
      ) => new CreditPaymentPlanCommands(plans, users),
      inject: [CREDIT_PAYMENT_PLAN_REPOSITORY, CREDIT_ACTOR_DIRECTORY],
    },
    {
      provide: ApproveCreditWithScheduleUseCase,
      useFactory: (
        applications: CreditApplicationRepositoryPort,
        actors: CreditActorDirectoryPort,
        decisions: CreditDecisionCommands,
        plans: CreditPaymentPlanCommands,
      ) => new ApproveCreditWithScheduleUseCase(applications, actors, decisions, plans),
      inject: [
        CREDIT_APPLICATION_REPOSITORY,
        CREDIT_ACTOR_DIRECTORY,
        CreditDecisionCommands,
        CreditPaymentPlanCommands,
      ],
    },
    {
      provide: CreditPolicyCommands,
      useFactory: (
        policies: CreditPolicyRepositoryPort,
        users: CreditActorDirectoryPort,
      ) => new CreditPolicyCommands(policies, users),
      inject: [CREDIT_POLICY_REPOSITORY, CREDIT_ACTOR_DIRECTORY],
    },
    {
      provide: CreditQueries,
      useFactory: (query: CreditQueryPort, users: CreditActorDirectoryPort) =>
        new CreditQueries(query, users),
      inject: [CREDIT_QUERY, CREDIT_ACTOR_DIRECTORY],
    },
  ],
  exports: [CREDIT_DIRECTORY, CREDIT_AUTHORIZATION],
})
export class CreditosModule {}
