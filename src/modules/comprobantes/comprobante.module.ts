import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { ComprobanteActorPort } from './application/ports/comprobante-actor.port';
import { ComprobanteUseCases } from './application/use-cases/comprobante.use-cases';
import { ComprobanteRepositoryPort } from './domain/ports/comprobante-repository.port';
import { ComprobanteSourcePort } from './domain/ports/comprobante-source.port';
import { COMPROBANTE_ACTOR, COMPROBANTE_REPOSITORY, COMPROBANTE_SOURCE } from './comprobante.tokens';
import { ComprobanteActorPrismaAdapter } from './infrastructure/persistence/prisma/comprobante-actor.prisma-adapter';
import { ComprobantePrismaRepository } from './infrastructure/persistence/prisma/comprobante.prisma-repository';
import { ComprobanteSourcePrismaAdapter } from './infrastructure/persistence/prisma/comprobante-source.prisma-adapter';
import { ComprobanteController } from './presentation/http/comprobante.controller';

@Module({
  controllers: [ComprobanteController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    ComprobanteActorPrismaAdapter,
    ComprobanteSourcePrismaAdapter,
    ComprobantePrismaRepository,
    { provide: COMPROBANTE_ACTOR, useExisting: ComprobanteActorPrismaAdapter },
    { provide: COMPROBANTE_SOURCE, useExisting: ComprobanteSourcePrismaAdapter },
    { provide: COMPROBANTE_REPOSITORY, useExisting: ComprobantePrismaRepository },
    {
      provide: ComprobanteUseCases,
      useFactory: (actors: ComprobanteActorPort, source: ComprobanteSourcePort,
        repository: ComprobanteRepositoryPort) =>
        new ComprobanteUseCases(actors, source, repository),
      inject: [COMPROBANTE_ACTOR, COMPROBANTE_SOURCE, COMPROBANTE_REPOSITORY],
    },
  ],
})
export class ComprobantesModule {}
