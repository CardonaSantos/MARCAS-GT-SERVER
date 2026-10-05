import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import {
  FinishTrackingUseCase,
  GetMyTrackingStateUseCase,
  RegisterTrackingLocationUseCase,
  StartTrackingUseCase,
} from '../../application/use-cases/tracking.use-cases';
import {
  GetTrackingAttendanceDetailUseCase,
  ListTrackingAttendanceLocationsUseCase,
  ListTrackingHistoryUseCase,
  ListTrackingRealtimeUseCase,
} from '../../application/use-cases/tracking-read.use-cases';
import {
  RegisterTrackingLocationDto,
  TrackingHistoryQueryDto,
  TrackingLocationsQueryDto,
} from './tracking-http.dto';

@Controller('real-time-location')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class TrackingController {
  constructor(
    private readonly startTracking: StartTrackingUseCase,
    private readonly getMyState: GetMyTrackingStateUseCase,
    private readonly registerLocation: RegisterTrackingLocationUseCase,
    private readonly finishTracking: FinishTrackingUseCase,
    private readonly listRealtime: ListTrackingRealtimeUseCase,
    private readonly listHistory: ListTrackingHistoryUseCase,
    private readonly getAttendanceDetail: GetTrackingAttendanceDetailUseCase,
    private readonly listAttendanceLocations: ListTrackingAttendanceLocationsUseCase,
  ) {}

  @Post('tracking/start')
  @Roles('VENDEDOR', 'REPARTIDOR', 'ADMIN')
  start(@CurrentActorId() usuarioId: number) {
    return this.startTracking.execute(usuarioId);
  }

  @Get('tracking/me')
  @Roles('VENDEDOR', 'REPARTIDOR', 'ADMIN')
  me(@CurrentActorId() usuarioId: number) {
    return this.getMyState.execute(usuarioId);
  }

  @Post('tracking/location')
  @Roles('VENDEDOR', 'REPARTIDOR', 'ADMIN')
  location(
    @CurrentActorId() usuarioId: number,
    @Body() body: RegisterTrackingLocationDto,
  ) {
    return this.registerLocation.execute({
      usuarioId,
      sesionTrackingId: body.sesionTrackingId,
      claveIdempotencia: body.claveIdempotencia,
      latitud: body.latitud,
      longitud: body.longitud,
      precision: body.precision ?? null,
      velocidad: body.velocidad ?? null,
      bateria: body.bateria ?? null,
      capturadoEn: body.capturadoEn,
    });
  }

  @Post('tracking/:sesionTrackingId/finish')
  @HttpCode(HttpStatus.OK)
  @Roles('VENDEDOR', 'REPARTIDOR', 'ADMIN')
  finish(
    @CurrentActorId() usuarioId: number,
    @Param('sesionTrackingId', ParseIntPipe) sesionId: number,
  ) {
    return this.finishTracking.execute(usuarioId, sesionId);
  }

  @Get('tracking/realtime')
  @Roles('ADMIN')
  realtime() {
    return this.listRealtime.execute();
  }

  @Get('tracking/history')
  @Roles('ADMIN')
  history(@Query() query: TrackingHistoryQueryDto) {
    return this.listHistory.execute({
      page: query.page,
      limit: query.limit,
      search: query.search,
      usuarioId: query.usuarioId,
      fechaDesde: query.fechaDesde ? new Date(query.fechaDesde) : null,
      fechaHasta: query.fechaHasta ? new Date(query.fechaHasta) : null,
      estadoSesion: query.estadoSesion ?? null,
    });
  }

  @Get('tracking/attendance/:asistenciaId')
  @Roles('ADMIN')
  attendance(@Param('asistenciaId', ParseIntPipe) asistenciaId: number) {
    return this.getAttendanceDetail.execute(asistenciaId);
  }

  @Get('tracking/attendance/:asistenciaId/locations')
  @Roles('ADMIN')
  locations(
    @Param('asistenciaId', ParseIntPipe) asistenciaId: number,
    @Query() query: TrackingLocationsQueryDto,
  ) {
    return this.listAttendanceLocations.execute({
      asistenciaId,
      sesionId: query.sesionTrackingId,
      page: query.page,
      limit: query.limit,
    });
  }
}
