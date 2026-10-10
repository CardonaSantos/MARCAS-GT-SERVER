import {
  BadRequestException, Controller, Get, Query, UseGuards, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import {
  DashboardRangeError, GetAdminActivityUseCase, GetAdminAgendaUseCase,
  GetAdminAlertsUseCase, GetAdminChartsUseCase, GetAdminLiveUseCase,
  GetAdminOverviewUseCase,
} from '../../application/use-cases/admin-dashboard.use-cases';
import { AdminDashboardQueryDto } from './dto/admin-dashboard-query.dto';

@Controller('dashboard/admin')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@Roles('ADMIN')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class AdminDashboardController {
  constructor(
    private readonly overview: GetAdminOverviewUseCase,
    private readonly alerts: GetAdminAlertsUseCase,
    private readonly agenda: GetAdminAgendaUseCase,
    private readonly charts: GetAdminChartsUseCase,
    private readonly activity: GetAdminActivityUseCase,
    private readonly live: GetAdminLiveUseCase,
  ) {}

  private async resolve(query: AdminDashboardQueryDto, invoke: () => Promise<unknown>) {
    try { return await invoke(); } catch (error) {
      if (error instanceof DashboardRangeError) throw new BadRequestException(error.message);
      throw error;
    }
  }
  @Get('resumen')
  getResumen(@Query() q: AdminDashboardQueryDto, @CurrentActorId() id: number) {
    return this.resolve(q, () => this.overview.execute(id, q));
  }
  @Get('alertas')
  getAlertas(@Query() q: AdminDashboardQueryDto, @CurrentActorId() id: number) {
    return this.resolve(q, () => this.alerts.execute(id, q));
  }
  @Get('agenda')
  getAgenda(@Query() q: AdminDashboardQueryDto, @CurrentActorId() id: number) {
    return this.resolve(q, () => this.agenda.execute(id, q));
  }
  @Get('graficos')
  getGraficos(@Query() q: AdminDashboardQueryDto, @CurrentActorId() id: number) {
    return this.resolve(q, () => this.charts.execute(id, q));
  }
  @Get('actividad')
  getActividad(@Query() q: AdminDashboardQueryDto, @CurrentActorId() id: number) {
    return this.resolve(q, () => this.activity.execute(id, q));
  }
  @Get('live')
  getLive(@Query() q: AdminDashboardQueryDto, @CurrentActorId() id: number) {
    return this.resolve(q, () => this.live.execute(id, q));
  }
}
