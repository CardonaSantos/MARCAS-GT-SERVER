import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TrackingDirectoryPrismaAdapter } from './infrastructure/tracking-directory.prisma-adapter';
import { TRACKING_DIRECTORY } from './tracking.tokens';
@Module({
  providers: [
    PrismaService,
    TrackingDirectoryPrismaAdapter,
    {
      provide: TRACKING_DIRECTORY,
      useExisting: TrackingDirectoryPrismaAdapter,
    },
  ],
  exports: [TRACKING_DIRECTORY],
})
export class TrackingModule {}
