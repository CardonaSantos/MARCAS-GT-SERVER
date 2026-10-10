import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { DASHBOARD_QUERY } from './application/ports/dashboard-query.port';
import {
  AdminDashboardReader, GetAdminOverviewUseCase, GetAdminAlertsUseCase,
  GetAdminAgendaUseCase, GetAdminChartsUseCase, GetAdminActivityUseCase,
  GetAdminLiveUseCase,
} from './application/use-cases/admin-dashboard.use-cases';
import { DashboardPrismaQueryAdapter } from './infrastructure/persistence/prisma/dashboard.prisma-query.adapter';
import { AdminDashboardController } from './presentation/http/admin-dashboard.controller';

@Module({
  controllers: [AdminDashboardController],
  providers: [
    PrismaService, ActiveUserRolesGuard, DashboardPrismaQueryAdapter,
    { provide: DASHBOARD_QUERY, useExisting: DashboardPrismaQueryAdapter },
    AdminDashboardReader,
    GetAdminOverviewUseCase, GetAdminAlertsUseCase, GetAdminAgendaUseCase,
    GetAdminChartsUseCase, GetAdminActivityUseCase, GetAdminLiveUseCase,
  ],
})
export class DashboardModule {}
