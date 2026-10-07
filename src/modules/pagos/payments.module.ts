import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { PaymentActorDirectoryPort } from './application/ports/payment-actor-directory.port';
import { PaymentContextPort } from './application/ports/payment-context.port';
import {
  PaymentDirectoryPort,
  PaymentQueryPort,
} from './application/ports/payment-query.port';
import { PaymentWorkflowPort } from './application/ports/payment-workflow.port';
import { AddPaymentProofUseCase } from './application/use-cases/add-payment-proof.use-case';
import { ApplyPaymentUseCase } from './application/use-cases/apply-payment.use-case';
import {
  GetPaymentSummaryUseCase,
  GetPaymentUseCase,
  ListPaymentApplicationsUseCase,
  ListPaymentBanksUseCase,
  ListPaymentEventsUseCase,
  ListPaymentsUseCase,
  ListReceivableCandidatesUseCase,
} from './application/use-cases/read.use-cases';
import { RegisterPaymentUseCase } from './application/use-cases/register-payment.use-case';
import { RejectPaymentUseCase } from './application/use-cases/reject-payment.use-case';
import { ReversePaymentApplicationUseCase } from './application/use-cases/reverse-payment-application.use-case';
import { VerifyPaymentUseCase } from './application/use-cases/verify-payment.use-case';
import { VoidPaymentUseCase } from './application/use-cases/void-payment.use-case';
import {
  PAYMENT_ACTOR_DIRECTORY,
  PAYMENT_CONTEXT_DIRECTORY,
  PAYMENT_DIRECTORY,
  PAYMENT_QUERY,
  PAYMENT_WORKFLOW,
} from './payment.tokens';
import { PaymentActorDirectoryPrismaAdapter } from './infrastructure/adapters/payment-actor-directory.prisma-adapter';
import { PaymentContextPrismaAdapter } from './infrastructure/adapters/payment-context.prisma-adapter';
import { PaymentPrismaQueryAdapter } from './infrastructure/persistence/prisma/payment.prisma-query.adapter';
import { PaymentWorkflowPrismaAdapter } from './infrastructure/persistence/prisma/payment-workflow.prisma-adapter';
import { PaymentController } from './presentation/http/payment.controller';

@Module({
  controllers: [PaymentController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    PaymentActorDirectoryPrismaAdapter,
    PaymentContextPrismaAdapter,
    PaymentWorkflowPrismaAdapter,
    PaymentPrismaQueryAdapter,

    {
      provide: PAYMENT_ACTOR_DIRECTORY,
      useExisting: PaymentActorDirectoryPrismaAdapter,
    },
    {
      provide: PAYMENT_CONTEXT_DIRECTORY,
      useExisting: PaymentContextPrismaAdapter,
    },
    {
      provide: PAYMENT_WORKFLOW,
      useExisting: PaymentWorkflowPrismaAdapter,
    },
    {
      provide: PAYMENT_QUERY,
      useExisting: PaymentPrismaQueryAdapter,
    },
    {
      provide: PAYMENT_DIRECTORY,
      useExisting: PaymentPrismaQueryAdapter,
    },

    {
      provide: RegisterPaymentUseCase,
      useFactory: (
        workflow: PaymentWorkflowPort,
        actors: PaymentActorDirectoryPort,
        context: PaymentContextPort,
      ) => new RegisterPaymentUseCase(workflow, actors, context),
      inject: [
        PAYMENT_WORKFLOW,
        PAYMENT_ACTOR_DIRECTORY,
        PAYMENT_CONTEXT_DIRECTORY,
      ],
    },
    {
      provide: AddPaymentProofUseCase,
      useFactory: (
        workflow: PaymentWorkflowPort,
        actors: PaymentActorDirectoryPort,
        context: PaymentContextPort,
      ) => new AddPaymentProofUseCase(workflow, actors, context),
      inject: [
        PAYMENT_WORKFLOW,
        PAYMENT_ACTOR_DIRECTORY,
        PAYMENT_CONTEXT_DIRECTORY,
      ],
    },
    {
      provide: VerifyPaymentUseCase,
      useFactory: (
        workflow: PaymentWorkflowPort,
        actors: PaymentActorDirectoryPort,
      ) => new VerifyPaymentUseCase(workflow, actors),
      inject: [PAYMENT_WORKFLOW, PAYMENT_ACTOR_DIRECTORY],
    },
    {
      provide: RejectPaymentUseCase,
      useFactory: (
        workflow: PaymentWorkflowPort,
        actors: PaymentActorDirectoryPort,
      ) => new RejectPaymentUseCase(workflow, actors),
      inject: [PAYMENT_WORKFLOW, PAYMENT_ACTOR_DIRECTORY],
    },
    {
      provide: ApplyPaymentUseCase,
      useFactory: (
        workflow: PaymentWorkflowPort,
        actors: PaymentActorDirectoryPort,
      ) => new ApplyPaymentUseCase(workflow, actors),
      inject: [PAYMENT_WORKFLOW, PAYMENT_ACTOR_DIRECTORY],
    },
    {
      provide: ReversePaymentApplicationUseCase,
      useFactory: (
        workflow: PaymentWorkflowPort,
        actors: PaymentActorDirectoryPort,
      ) => new ReversePaymentApplicationUseCase(workflow, actors),
      inject: [PAYMENT_WORKFLOW, PAYMENT_ACTOR_DIRECTORY],
    },
    {
      provide: VoidPaymentUseCase,
      useFactory: (
        workflow: PaymentWorkflowPort,
        actors: PaymentActorDirectoryPort,
      ) => new VoidPaymentUseCase(workflow, actors),
      inject: [PAYMENT_WORKFLOW, PAYMENT_ACTOR_DIRECTORY],
    },

    ...readProviders(),
  ],
  exports: [PAYMENT_DIRECTORY],
})
export class PagosModule {}

function readProviders() {
  const make = (
    UseCase: new (
      query: PaymentQueryPort,
      actors: PaymentActorDirectoryPort,
    ) => any,
  ) => ({
    provide: UseCase,
    useFactory: (
      query: PaymentQueryPort,
      actors: PaymentActorDirectoryPort,
    ) => new UseCase(query, actors),
    inject: [PAYMENT_QUERY, PAYMENT_ACTOR_DIRECTORY],
  });

  return [
    make(ListPaymentBanksUseCase),
    make(ListPaymentsUseCase),
    make(GetPaymentUseCase),
    make(ListPaymentEventsUseCase),
    make(ListPaymentApplicationsUseCase),
    make(ListReceivableCandidatesUseCase),
    make(GetPaymentSummaryUseCase),
  ];
}
