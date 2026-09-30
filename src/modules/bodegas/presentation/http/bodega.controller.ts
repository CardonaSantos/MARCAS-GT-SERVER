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
import { ActivateBodegaUseCase } from '../../application/use-cases/activate-bodega.use-case';
import { AssignBodegaResponsibleUseCase } from '../../application/use-cases/assign-bodega-responsible.use-case';
import { CreateBodegaUseCase } from '../../application/use-cases/create-bodega.use-case';
import { DeactivateBodegaUseCase } from '../../application/use-cases/deactivate-bodega.use-case';
import { GetBodegaOverviewUseCase } from '../../application/use-cases/get-bodega-overview.use-case';
import { GetBodegaUseCase } from '../../application/use-cases/get-bodega.use-case';
import { GetPrincipalBodegaUseCase } from '../../application/use-cases/get-principal-bodega.use-case';
import { ListBodegaEventsUseCase } from '../../application/use-cases/list-bodega-events.use-case';
import { ListBodegaSelectablesUseCase } from '../../application/use-cases/list-bodega-selectables.use-case';
import { ListBodegasUseCase } from '../../application/use-cases/list-bodegas.use-case';
import { SetPrincipalBodegaUseCase } from '../../application/use-cases/set-principal-bodega.use-case';
import { UpdateBodegaUseCase } from '../../application/use-cases/update-bodega.use-case';
import { Bodega } from '../../domain/entities/bodega.entity';
import { BodegaExceptionFilter } from './bodega-exception.filter';
import {
  AssignBodegaResponsibleDto,
  BodegaEventsQueryDto,
  BodegaSelectQueryDto,
  CreateBodegaDto,
  DeactivateBodegaDto,
  ListBodegasQueryDto,
  UpdateBodegaDto,
} from './dto/bodega-http.dto';
import { CurrentBodegaActorId } from './security/current-bodega-actor.decorator';
import {
  BODEGA_READ_ROLES,
  BodegaRoles,
} from './security/bodega-roles.decorator';
import { BodegaRolesGuard } from './security/bodega-roles.guard';

@Controller('bodegas')
@UseGuards(AuthGuard('jwt'), BodegaRolesGuard)
@UseFilters(BodegaExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class BodegaController {
  constructor(
    private readonly createBodega: CreateBodegaUseCase,
    private readonly updateBodega: UpdateBodegaUseCase,
    private readonly assignResponsible: AssignBodegaResponsibleUseCase,
    private readonly activateBodega: ActivateBodegaUseCase,
    private readonly deactivateBodega: DeactivateBodegaUseCase,
    private readonly setPrincipal: SetPrincipalBodegaUseCase,
    private readonly getBodega: GetBodegaUseCase,
    private readonly getPrincipal: GetPrincipalBodegaUseCase,
    private readonly listBodegas: ListBodegasUseCase,
    private readonly listSelectables: ListBodegaSelectablesUseCase,
    private readonly listEvents: ListBodegaEventsUseCase,
    private readonly getOverview: GetBodegaOverviewUseCase,
  ) {}

  @Post()
  @BodegaRoles('ADMIN')
  async create(
    @Body() dto: CreateBodegaDto,
    @CurrentBodegaActorId() actorId: number,
  ) {
    const bodega = await this.createBodega.execute({ ...dto, actorId });
    return this.toEnrichedDetail(bodega);
  }

  @Get()
  @BodegaRoles(...BODEGA_READ_ROLES)
  list(@Query() query: ListBodegasQueryDto) {
    return this.listBodegas.execute(query);
  }

  @Get('seleccionables')
  @BodegaRoles(...BODEGA_READ_ROLES)
  selectables(@Query() query: BodegaSelectQueryDto) {
    return this.listSelectables.execute(query);
  }

  @Get('principal')
  @BodegaRoles(...BODEGA_READ_ROLES)
  principal() {
    return this.getPrincipal.execute();
  }

  @Get('resumen')
  @BodegaRoles('ADMIN', 'BODEGA', 'CONTABILIDAD')
  overview() {
    return this.getOverview.execute();
  }

  @Get(':id')
  @BodegaRoles(...BODEGA_READ_ROLES)
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.getBodega.execute(id);
  }

  @Get(':id/eventos')
  @BodegaRoles('ADMIN', 'BODEGA')
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: BodegaEventsQueryDto,
  ) {
    return this.listEvents.execute(id, query);
  }

  @Patch(':id')
  @BodegaRoles('ADMIN')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBodegaDto,
    @CurrentBodegaActorId() actorId: number,
  ) {
    const bodega = await this.updateBodega.execute({ id, ...dto, actorId });
    return this.toEnrichedDetail(bodega);
  }

  @Patch(':id/responsable')
  @BodegaRoles('ADMIN')
  async responsible(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignBodegaResponsibleDto,
    @CurrentBodegaActorId() actorId: number,
  ) {
    const bodega = await this.assignResponsible.execute({
      id,
      responsableId: dto.responsableId ?? null,
      actorId,
    });
    return this.toEnrichedDetail(bodega);
  }

  @Patch(':id/activar')
  @BodegaRoles('ADMIN')
  async activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentBodegaActorId() actorId: number,
  ) {
    const bodega = await this.activateBodega.execute({ id, actorId });
    return this.toEnrichedDetail(bodega);
  }

  @Patch(':id/desactivar')
  @BodegaRoles('ADMIN')
  async deactivate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeactivateBodegaDto,
    @CurrentBodegaActorId() actorId: number,
  ) {
    const bodega = await this.deactivateBodega.execute({
      id,
      motivo: dto.motivo,
      actorId,
    });
    return this.toEnrichedDetail(bodega);
  }

  @Patch(':id/principal')
  @BodegaRoles('ADMIN')
  async principalize(
    @Param('id', ParseIntPipe) id: number,
    @CurrentBodegaActorId() actorId: number,
  ) {
    const bodega = await this.setPrincipal.execute({ id, actorId });
    return this.toEnrichedDetail(bodega);
  }

  private toEnrichedDetail(bodega: Bodega) {
    if (!bodega.id) throw new Error('La bodega persistida no tiene id.');
    return this.getBodega.execute(bodega.id);
  }
}
