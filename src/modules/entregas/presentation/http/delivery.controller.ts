import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
  UseFilters, UseGuards, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import { CreateDeliveryUseCase } from '../../application/use-cases/create-delivery.use-case';
import { StartDeliveryUseCase } from '../../application/use-cases/start-delivery.use-case';
import { UpdateDeliveryResultUseCase } from '../../application/use-cases/update-delivery-result.use-case';
import { AddDeliveryEvidenceUseCase, RemoveDeliveryEvidenceUseCase } from '../../application/use-cases/evidence.use-cases';
import { FinalizeDeliveryUseCase } from '../../application/use-cases/finalize-delivery.use-case';
import { AddDeliveryObservationUseCase } from '../../application/use-cases/add-delivery-observation.use-case';
import {
  GetDeliveryOperationalReportUseCase, GetDeliverySummaryUseCase, GetDeliveryUseCase,
  ListDeliveriesUseCase, ListDeliveryCandidatesUseCase, ListDeliveryEventsUseCase,
  ListDeliveryEvidenceUseCase,
} from '../../application/use-cases/read.use-cases';
import { DeliveryExceptionFilter } from './delivery-exception.filter';
import {
  AddDeliveryEvidenceDto, CreateDeliveryDto, DeliveryCandidateDto, DeliveryEventQueryDto,
  DeliveryListDto, DeliveryObservationDto, DeliveryRangeDto, FinalizeDeliveryDto,
  StartDeliveryDto, UpdateDeliveryResultDto,
} from './dto/delivery-http.dto';

const READ = ['ADMIN','BODEGA','CONTABILIDAD','VENDEDOR','REPARTIDOR'] as const;
const OPERATE = ['ADMIN','BODEGA','REPARTIDOR'] as const;

@Controller('entregas')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(DeliveryExceptionFilter)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class DeliveryController {
  constructor(
    private readonly createUse: CreateDeliveryUseCase,
    private readonly startUse: StartDeliveryUseCase,
    private readonly resultUse: UpdateDeliveryResultUseCase,
    private readonly addEvidenceUse: AddDeliveryEvidenceUseCase,
    private readonly removeEvidenceUse: RemoveDeliveryEvidenceUseCase,
    private readonly finalizeUse: FinalizeDeliveryUseCase,
    private readonly observationUse: AddDeliveryObservationUseCase,
    private readonly listUse: ListDeliveriesUseCase,
    private readonly candidatesUse: ListDeliveryCandidatesUseCase,
    private readonly getUse: GetDeliveryUseCase,
    private readonly eventsUse: ListDeliveryEventsUseCase,
    private readonly evidenceUse: ListDeliveryEvidenceUseCase,
    private readonly summaryUse: GetDeliverySummaryUseCase,
    private readonly reportUse: GetDeliveryOperationalReportUseCase,
  ) {}

  @Get() @Roles(...READ)
  list(@Query() q: DeliveryListDto, @CurrentActorId() actorId: number) { return this.listUse.execute(q, actorId); }

  @Get('candidatos') @Roles(...OPERATE)
  candidates(@Query() q: DeliveryCandidateDto, @CurrentActorId() actorId: number) { return this.candidatesUse.execute(q, actorId); }

  @Get('resumen') @Roles(...READ)
  summary(@Query() q: DeliveryRangeDto, @CurrentActorId() actorId: number) { return this.summaryUse.execute(q, actorId); }

  @Get('reportes/operacion') @Roles('ADMIN','BODEGA','CONTABILIDAD')
  report(@Query() q: DeliveryRangeDto, @CurrentActorId() actorId: number) { return this.reportUse.execute(q, actorId); }

  @Post() @Roles(...OPERATE)
  async create(@Body() dto: CreateDeliveryDto, @CurrentActorId() actorId: number) {
    const created = await this.createUse.execute({ ...dto, actorId });
    return this.getUse.execute(created.id, actorId);
  }

  @Get(':id') @Roles(...READ)
  get(@Param('id', ParseIntPipe) id: number, @CurrentActorId() actorId: number) { return this.getUse.execute(id, actorId); }

  @Get(':id/eventos') @Roles(...READ)
  events(@Param('id', ParseIntPipe) id: number, @Query() q: DeliveryEventQueryDto, @CurrentActorId() actorId: number) {
    return this.eventsUse.execute(id, q, actorId);
  }

  @Get(':id/evidencias') @Roles(...READ)
  evidence(@Param('id', ParseIntPipe) id: number, @CurrentActorId() actorId: number) { return this.evidenceUse.execute(id, actorId); }

  @Post(':id/iniciar') @Roles(...OPERATE)
  async start(@Param('id', ParseIntPipe) id: number, @Body() dto: StartDeliveryDto, @CurrentActorId() actorId: number) {
    await this.startUse.execute({ id, ...dto, actorId });
    return this.getUse.execute(id, actorId);
  }

  @Patch(':id/resultado') @Roles(...OPERATE)
  async result(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeliveryResultDto, @CurrentActorId() actorId: number) {
    await this.resultUse.execute({ id, ...dto, actorId });
    return this.getUse.execute(id, actorId);
  }

  @Post(':id/evidencias') @Roles(...OPERATE)
  async addEvidence(@Param('id', ParseIntPipe) id: number, @Body() dto: AddDeliveryEvidenceDto, @CurrentActorId() actorId: number) {
    const evidence = await this.addEvidenceUse.execute(id, dto, actorId);
    return { evidence, entrega: await this.getUse.execute(id, actorId) };
  }

  @Delete(':id/evidencias/:evidenciaId') @Roles(...OPERATE)
  async removeEvidence(@Param('id', ParseIntPipe) id: number, @Param('evidenciaId', ParseIntPipe) evidenciaId: number, @CurrentActorId() actorId: number) {
    await this.removeEvidenceUse.execute(id, evidenciaId, actorId);
    return this.getUse.execute(id, actorId);
  }

  @Post(':id/finalizar') @Roles(...OPERATE)
  async finalize(@Param('id', ParseIntPipe) id: number, @Body() dto: FinalizeDeliveryDto, @CurrentActorId() actorId: number) {
    await this.finalizeUse.execute({ id, ...dto, actorId });
    return this.getUse.execute(id, actorId);
  }

  @Post(':id/observaciones') @Roles(...OPERATE)
  async observation(@Param('id', ParseIntPipe) id: number, @Body() dto: DeliveryObservationDto, @CurrentActorId() actorId: number) {
    await this.observationUse.execute(id, dto.detalle, dto.claveIdempotencia, actorId);
    return this.getUse.execute(id, actorId);
  }
}
