import { forwardRef, Module } from '@nestjs/common';
import { ProspectoService } from './prospecto.service';
import { ProspectWorkflowService } from './workflow/prospect-workflow.service';
import { ProspectoController } from './prospecto.controller';
import { PrismaService } from 'src/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { LocationGateway } from 'src/location/location.gateway';
import { LocationModule } from 'src/location/location.module';

@Module({
  controllers: [ProspectoController],
  providers: [
    ProspectoService,
    ProspectWorkflowService,
    PrismaService,
    NotificationsService,
    // LocationGateway,
  ],
  imports: [forwardRef(() => LocationModule)],
})
export class ProspectoModule {}
