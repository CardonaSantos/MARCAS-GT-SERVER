import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { AddDispatchObservationUseCase } from '../../application/use-cases/add-dispatch-observation.use-case';
import { CancelDispatchUseCase } from '../../application/use-cases/cancel-dispatch.use-case';
import { CompleteDispatchPreparationUseCase } from '../../application/use-cases/complete-dispatch-preparation.use-case';
import { CreateDispatchUseCase } from '../../application/use-cases/create-dispatch.use-case';
import { GetDispatchOperationalReportUseCase } from '../../application/use-cases/get-dispatch-operational-report.use-case';
import { GetDispatchSummaryUseCase } from '../../application/use-cases/get-dispatch-summary.use-case';
import { GetDispatchUseCase } from '../../application/use-cases/get-dispatch.use-case';
import { ListDispatchCandidatesUseCase } from '../../application/use-cases/list-dispatch-candidates.use-case';
import { ListDispatchEventsUseCase } from '../../application/use-cases/list-dispatch-events.use-case';
import { ListDispatchOperationsUseCase } from '../../application/use-cases/list-dispatch-operations.use-case';
import { ListDispatchesUseCase } from '../../application/use-cases/list-dispatches.use-case';
import { RegisterDispatchOutputUseCase } from '../../application/use-cases/register-dispatch-output.use-case';
import { RetryDispatchOperationUseCase } from '../../application/use-cases/retry-dispatch-operation.use-case';
import { StartDispatchPreparationUseCase } from '../../application/use-cases/start-dispatch-preparation.use-case';
import { UpdateDispatchPreparationUseCase } from '../../application/use-cases/update-dispatch-preparation.use-case';
import { UpdateDispatchUseCase } from '../../application/use-cases/update-dispatch.use-case';
import { DispatchExceptionFilter } from './dispatch-exception.filter';
import {
  CancelDispatchDto,
  CreateDispatchDto,
  DispatchCandidateQueryDto,
  DispatchEventQueryDto,
  DispatchListQueryDto,
  DispatchObservationDto,
  DispatchOperationListQueryDto,
  DispatchOperationalReportQueryDto,
  DispatchSummaryQueryDto,
  RegisterDispatchOutputDto,
  StartDispatchPreparationDto,
  UpdateDispatchDto,
  UpdateDispatchPreparationDto,
} from './dto/dispatch-http.dto';

const READ_ROLES = [
  'ADMIN',
  'BODEGA',
  'CONTABILIDAD',
  'VENDEDOR',
  'REPARTIDOR',
] as const;

const OPERATIVE_ROLES = ['ADMIN', 'BODEGA'] as const;
const CANDIDATE_ROLES = [
  'ADMIN',
  'BODEGA',
  'CONTABILIDAD',
  'VENDEDOR',
] as const;

@Controller('despachos')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(DispatchExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class DispatchController {
  constructor(
    private readonly createDispatch: CreateDispatchUseCase,
    private readonly updateDispatch: UpdateDispatchUseCase,
    private readonly startPreparation: StartDispatchPreparationUseCase,
    private readonly updatePreparation: UpdateDispatchPreparationUseCase,
    private readonly completePreparation: CompleteDispatchPreparationUseCase,
    private readonly registerOutput: RegisterDispatchOutputUseCase,
    private readonly cancelDispatch: CancelDispatchUseCase,
    private readonly retryOperation: RetryDispatchOperationUseCase,
    private readonly addObservation: AddDispatchObservationUseCase,
    private readonly listCandidates: ListDispatchCandidatesUseCase,
    private readonly listDispatches: ListDispatchesUseCase,
    private readonly getDispatch: GetDispatchUseCase,
    private readonly listEvents: ListDispatchEventsUseCase,
    private readonly listOperations: ListDispatchOperationsUseCase,
    private readonly getSummary: GetDispatchSummaryUseCase,
    private readonly getOperationalReport: GetDispatchOperationalReportUseCase,
  ) {}

  @Post()
  @Roles(...OPERATIVE_ROLES)
  async create(
    @Body() dto: CreateDispatchDto,
    @CurrentActorId() actorId: number,
  ) {
    const created = await this.createDispatch.execute({
      ...dto,
      actorId,
    });
    return this.getDispatch.execute(created.id!, actorId);
  }

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query() query: DispatchListQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.listDispatches.execute(query as any, actorId);
  }

  @Get('candidatos')
  @Roles(...CANDIDATE_ROLES)
  candidates(
    @Query() query: DispatchCandidateQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.listCandidates.execute(query as any, actorId);
  }

  @Get('resumen')
  @Roles(...READ_ROLES)
  summary(
    @Query() query: DispatchSummaryQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.getSummary.execute(query as any, actorId);
  }

  @Get('reportes/operacion')
  @Roles(...READ_ROLES)
  operationalReport(
    @Query() query: DispatchOperationalReportQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.getOperationalReport.execute(query as any, actorId);
  }

  @Get('operaciones')
  @Roles(...READ_ROLES)
  operations(
    @Query() query: DispatchOperationListQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.listOperations.execute(query as any, actorId);
  }

  @Post('operaciones/:operationId/reintentar')
  @Roles(...OPERATIVE_ROLES)
  async retry(
    @Param('operationId', ParseIntPipe) operationId: number,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.retryOperation.execute(
      operationId,
      actorId,
    );

    return {
      result,
      despacho: await this.getDispatch.execute(
        result.dispatchId,
        actorId,
      ),
    };
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.getDispatch.execute(id, actorId);
  }

  @Get(':id/eventos')
  @Roles(...READ_ROLES)
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DispatchEventQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.listEvents.execute(id, query as any, actorId);
  }

  @Get(':id/operaciones')
  @Roles(...READ_ROLES)
  dispatchOperations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DispatchOperationListQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.listOperations.execute(
      { ...query, dispatchId: id } as any,
      actorId,
    );
  }

  @Patch(':id')
  @Roles(...OPERATIVE_ROLES)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDispatchDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.updateDispatch.execute({ id, ...dto, actorId });
    return this.getDispatch.execute(id, actorId);
  }

  @Post(':id/iniciar-preparacion')
  @Roles(...OPERATIVE_ROLES)
  async start(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StartDispatchPreparationDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.startPreparation.execute({
      id,
      ...dto,
      actorId,
    });

    return {
      result,
      despacho: await this.getDispatch.execute(id, actorId),
    };
  }

  @Patch(':id/preparacion')
  @Roles(...OPERATIVE_ROLES)
  async preparation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDispatchPreparationDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.updatePreparation.execute({
      id,
      detalles: dto.detalles,
      actorId,
    });
    return this.getDispatch.execute(id, actorId);
  }

  @Post(':id/finalizar-preparacion')
  @Roles(...OPERATIVE_ROLES)
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    await this.completePreparation.execute(id, actorId);
    return this.getDispatch.execute(id, actorId);
  }

  @Post(':id/salidas')
  @Roles(...OPERATIVE_ROLES)
  async output(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterDispatchOutputDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.registerOutput.execute({
      id,
      ...dto,
      actorId,
    });

    return {
      result,
      despacho: await this.getDispatch.execute(id, actorId),
    };
  }

  @Post(':id/cancelar')
  @Roles(...OPERATIVE_ROLES)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelDispatchDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.cancelDispatch.execute({
      id,
      ...dto,
      actorId,
    });

    return {
      result,
      despacho: await this.getDispatch.execute(id, actorId),
    };
  }

  @Post(':id/observaciones')
  @Roles(...READ_ROLES)
  async observation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DispatchObservationDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.addObservation.execute({
      id,
      detalle: dto.detalle,
      actorId,
    });

    return this.getDispatch.execute(id, actorId);
  }
}
