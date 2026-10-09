import { forwardRef, Module } from '@nestjs/common';
import { DateService } from './date.service';
import { VisitWorkflowService } from './workflow/visit-workflow.service';
import { DateController } from './date.controller';
import { PrismaService } from 'src/prisma.service';
import { LocationModule } from 'src/location/location.module';
import { NotificationsService } from 'src/notifications/notifications.service';

@Module({
  controllers: [DateController],
  providers: [DateService, VisitWorkflowService, PrismaService, NotificationsService],
  // providers: [AttendanceService, PrismaService, NotificationsService],
  imports: [forwardRef(() => LocationModule)],
})
export class DateModule {}
