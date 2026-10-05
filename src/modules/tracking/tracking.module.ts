import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import {
  ExpireTrackingUseCase,
  FinishTrackingUseCase,
  GetMyTrackingStateUseCase,
  RegisterTrackingLocationUseCase,
  StartTrackingUseCase,
} from './application/use-cases/tracking.use-cases';
import {
  GetTrackingAttendanceDetailUseCase,
  ListTrackingAttendanceLocationsUseCase,
  ListTrackingHistoryUseCase,
  ListTrackingRealtimeUseCase,
} from './application/use-cases/tracking-read.use-cases';
import { TrackingDirectoryPrismaAdapter } from './infrastructure/tracking-directory.prisma-adapter';
import { TrackingExpirationScheduler } from './infrastructure/tracking-expiration.scheduler';
import { TrackingPrismaRepository } from './infrastructure/tracking.prisma-repository';
import { TrackingQueryPrismaAdapter } from './infrastructure/tracking-query.prisma-adapter';
import { TrackingRealtimeGateway } from './infrastructure/tracking-realtime.gateway';
import { TrackingController } from './presentation/http/tracking.controller';
import {
  TRACKING_DIRECTORY,
  TRACKING_QUERY,
  TRACKING_REALTIME,
  TRACKING_REPOSITORY,
} from './tracking.tokens';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'MySecretKey',
      }),
    }),
  ],
  controllers: [TrackingController],
  providers: [
    PrismaService,
    ActiveUserRolesGuard,
    TrackingDirectoryPrismaAdapter,
    TrackingPrismaRepository,
    TrackingQueryPrismaAdapter,
    TrackingRealtimeGateway,
    TrackingExpirationScheduler,
    StartTrackingUseCase,
    GetMyTrackingStateUseCase,
    RegisterTrackingLocationUseCase,
    FinishTrackingUseCase,
    ExpireTrackingUseCase,
    ListTrackingRealtimeUseCase,
    ListTrackingHistoryUseCase,
    GetTrackingAttendanceDetailUseCase,
    ListTrackingAttendanceLocationsUseCase,
    {
      provide: TRACKING_DIRECTORY,
      useExisting: TrackingDirectoryPrismaAdapter,
    },
    {
      provide: TRACKING_REPOSITORY,
      useExisting: TrackingPrismaRepository,
    },
    {
      provide: TRACKING_QUERY,
      useExisting: TrackingQueryPrismaAdapter,
    },
    {
      provide: TRACKING_REALTIME,
      useExisting: TrackingRealtimeGateway,
    },
  ],
  exports: [TRACKING_DIRECTORY],
})
export class TrackingModule {}
