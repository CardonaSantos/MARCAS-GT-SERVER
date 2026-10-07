import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import { CreateShipmentUseCase } from '../../application/use-cases/create-shipment.use-case';
import { AssignShipmentUseCase } from '../../application/use-cases/assign-shipment.use-case';
import { ConfirmShipmentLoadUseCase } from '../../application/use-cases/confirm-shipment-load.use-case';
import {
  StartShipmentRouteUseCase,
  CancelShipmentUseCase,
  ReportShipmentIncidentUseCase,
  ResolveShipmentIncidentUseCase,
  AddShipmentObservationUseCase,
} from '../../application/use-cases/workflow.use-cases';
import {
  GetShipmentUseCase,
  GetTransportOperationalReportUseCase,
  GetTransportSummaryUseCase,
  ListShipmentCandidatesUseCase,
  ListShipmentEventsUseCase,
  ListShipmentIncidentsUseCase,
  ListShipmentsUseCase,
} from '../../application/use-cases/read.use-cases';
import { TransportExceptionFilter } from './transport-exception.filter';
import {
  AssignShipmentDto,
  CancelDto,
  CandidateDto,
  ConfirmLoadDto,
  CreateShipmentDto,
  IncidentDto,
  IncidentListDto,
  ListDto,
  ObservationDto,
  PageDto,
  RangeDto,
  ResolveIncidentDto,
  RouteDto,
} from './dto/transport-http.dto';
@Controller('envios')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(TransportExceptionFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class TransportController {
  constructor(
    private readonly createUse: CreateShipmentUseCase,
    private readonly assignUse: AssignShipmentUseCase,
    private readonly loadUse: ConfirmShipmentLoadUseCase,
    private readonly startUse: StartShipmentRouteUseCase,
    private readonly cancelUse: CancelShipmentUseCase,
    private readonly reportIncident: ReportShipmentIncidentUseCase,
    private readonly resolveIncident: ResolveShipmentIncidentUseCase,
    private readonly listUse: ListShipmentsUseCase,
    private readonly getUse: GetShipmentUseCase,
    private readonly candidatesUse: ListShipmentCandidatesUseCase,
    private readonly eventsUse: ListShipmentEventsUseCase,
    private readonly incidentsUse: ListShipmentIncidentsUseCase,
    private readonly summaryUse: GetTransportSummaryUseCase,
    private readonly reportUse: GetTransportOperationalReportUseCase,
    private readonly observationUse: AddShipmentObservationUseCase,
  ) {}
  @Get()
  @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD', 'VENDEDOR', 'REPARTIDOR')
  list(@Query() q: ListDto, @CurrentActorId() a: number) {
    return this.listUse.execute(q, a);
  }
  @Get('candidatos') @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD') candidates(
    @Query() q: CandidateDto,
    @CurrentActorId() a: number,
  ) {
    return this.candidatesUse.execute(q, a);
  }
  @Get('resumen')
  @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD', 'VENDEDOR', 'REPARTIDOR')
  summary(@Query() q: RangeDto, @CurrentActorId() a: number) {
    return this.summaryUse.execute(q, a);
  }
  @Get('reportes/operacion') @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD') report(
    @Query() q: RangeDto,
    @CurrentActorId() a: number,
  ) {
    return this.reportUse.execute(q, a);
  }
  @Post() @Roles('ADMIN', 'BODEGA') create(
    @Body() d: CreateShipmentDto,
    @CurrentActorId() a: number,
  ) {
    return this.createUse.execute({ ...d, actorId: a });
  }
  @Get(':id')
  @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD', 'VENDEDOR', 'REPARTIDOR')
  get(@Param('id', ParseIntPipe) id: number, @CurrentActorId() a: number) {
    return this.getUse.execute(id, a);
  }
  @Get(':id/eventos')
  @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD', 'VENDEDOR', 'REPARTIDOR')
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: PageDto,
    @CurrentActorId() a: number,
  ) {
    return this.eventsUse.execute(id, q, a);
  }
  @Get(':id/incidencias')
  @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD', 'VENDEDOR', 'REPARTIDOR')
  incidents(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: IncidentListDto,
    @CurrentActorId() a: number,
  ) {
    return this.incidentsUse.execute(id, q, a);
  }
  @Post(':id/asignar') @Roles('ADMIN', 'BODEGA') assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: AssignShipmentDto,
    @CurrentActorId() a: number,
  ) {
    return this.assignUse.execute({ id, ...d, actorId: a });
  }
  @Post(':id/confirmar-carga') @Roles('ADMIN', 'BODEGA') load(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: ConfirmLoadDto,
    @CurrentActorId() a: number,
  ) {
    return this.loadUse.execute({ id, ...d, actorId: a });
  }
  @Post(':id/iniciar-ruta') @Roles('ADMIN', 'BODEGA', 'REPARTIDOR') start(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: RouteDto,
    @CurrentActorId() a: number,
  ) {
    return this.startUse.execute({ id, ...d, actorId: a });
  }
  @Post(':id/cancelar') @Roles('ADMIN', 'BODEGA') cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: CancelDto,
    @CurrentActorId() a: number,
  ) {
    return this.cancelUse.execute({ id, ...d, actorId: a });
  }
  @Post(':id/observaciones')
  @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD', 'VENDEDOR', 'REPARTIDOR')
  obs(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: ObservationDto,
    @CurrentActorId() a: number,
  ) {
    return this.observationUse.execute({
      id,
      actorId: a,
      detalle: d.detalle,
      claveIdempotencia: d.claveIdempotencia,
    });
  }
  @Post(':id/incidencias') @Roles('ADMIN', 'BODEGA', 'REPARTIDOR') incident(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: IncidentDto,
    @CurrentActorId() a: number,
  ) {
    return this.reportIncident.execute({ id, ...d, actorId: a });
  }
  @Post(':id/incidencias/:incidentId/resolver')
  @Roles('ADMIN', 'BODEGA', 'REPARTIDOR')
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Param('incidentId', ParseIntPipe) incidentId: number,
    @Body() d: ResolveIncidentDto,
    @CurrentActorId() a: number,
  ) {
    return this.resolveIncident.execute({ id, incidentId, ...d, actorId: a });
  }
}
