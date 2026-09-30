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
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { Roles } from 'src/shared/security/roles.decorator';
import { ApproveRequisitionUseCase } from '../../application/use-cases/approve-requisition.use-case';
import { CancelRequisitionUseCase } from '../../application/use-cases/cancel-requisition.use-case';
import { CreateRequisitionUseCase } from '../../application/use-cases/create-requisition.use-case';
import { GetRequisitionSummaryUseCase } from '../../application/use-cases/get-requisition-summary.use-case';
import { GetRequisitionUseCase } from '../../application/use-cases/get-requisition.use-case';
import { ListRequisitionEventsUseCase } from '../../application/use-cases/list-requisition-events.use-case';
import { ListRequisitionReceiptsUseCase } from '../../application/use-cases/list-requisition-receipts.use-case';
import { ListRequisitionsUseCase } from '../../application/use-cases/list-requisitions.use-case';
import { RegisterRequisitionReceiptUseCase } from '../../application/use-cases/register-requisition-receipt.use-case';
import { RejectRequisitionUseCase } from '../../application/use-cases/reject-requisition.use-case';
import { RequestRequisitionUseCase } from '../../application/use-cases/request-requisition.use-case';
import { UpdateRequisitionUseCase } from '../../application/use-cases/update-requisition.use-case';
import {
  CreateRequisitionDto,
  ReceiptListQueryDto,
  RegisterRequisitionReceiptDto,
  RequisitionEventQueryDto,
  RequisitionListQueryDto,
  RequisitionReasonDto,
  RequisitionSummaryQueryDto,
  UpdateRequisitionDto,
} from './dto/requisition-http.dto';
import { RequisitionExceptionFilter } from './requisition-exception.filter';

const READ_ROLES = ['ADMIN', 'BODEGA', 'CONTABILIDAD'] as const;
const OPERATIVE_ROLES = ['ADMIN', 'BODEGA'] as const;

@Controller('requisiciones')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(RequisitionExceptionFilter)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class RequisitionController {
  constructor(
    private readonly createRequisition: CreateRequisitionUseCase,
    private readonly updateRequisition: UpdateRequisitionUseCase,
    private readonly requestRequisition: RequestRequisitionUseCase,
    private readonly approveRequisition: ApproveRequisitionUseCase,
    private readonly rejectRequisition: RejectRequisitionUseCase,
    private readonly cancelRequisition: CancelRequisitionUseCase,
    private readonly registerReceipt: RegisterRequisitionReceiptUseCase,
    private readonly listRequisitions: ListRequisitionsUseCase,
    private readonly getRequisition: GetRequisitionUseCase,
    private readonly listEvents: ListRequisitionEventsUseCase,
    private readonly listReceipts: ListRequisitionReceiptsUseCase,
    private readonly getSummary: GetRequisitionSummaryUseCase,
  ) {}

  @Post()
  @Roles(...OPERATIVE_ROLES)
  async create(@Body() dto: CreateRequisitionDto, @CurrentActorId() actorId: number) {
    const created = await this.createRequisition.execute({ ...dto, actorId });
    if (!created.id) throw new Error('La requisición persistida no tiene id.');
    return this.getRequisition.execute(created.id);
  }

  @Get()
  @Roles(...READ_ROLES)
  list(@Query() query: RequisitionListQueryDto) {
    return this.listRequisitions.execute(query);
  }

  @Get('resumen')
  @Roles(...READ_ROLES)
  summary(@Query() query: RequisitionSummaryQueryDto) {
    return this.getSummary.execute(query);
  }

  @Get('recepciones')
  @Roles(...READ_ROLES)
  receipts(@Query() query: ReceiptListQueryDto) {
    return this.listReceipts.execute(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.getRequisition.execute(id);
  }

  @Get(':id/eventos')
  @Roles(...READ_ROLES)
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RequisitionEventQueryDto,
  ) {
    return this.listEvents.execute(id, query);
  }

  @Get(':id/recepciones')
  @Roles(...READ_ROLES)
  requisitionReceipts(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ReceiptListQueryDto,
  ) {
    return this.listReceipts.execute({ ...query, requisicionId: id });
  }

  @Patch(':id')
  @Roles(...OPERATIVE_ROLES)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRequisitionDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.updateRequisition.execute({ id, ...dto, actorId });
    return this.getRequisition.execute(id);
  }

  @Patch(':id/solicitar')
  @Roles(...OPERATIVE_ROLES)
  async request(@Param('id', ParseIntPipe) id: number, @CurrentActorId() actorId: number) {
    await this.requestRequisition.execute({ id, actorId });
    return this.getRequisition.execute(id);
  }

  @Patch(':id/aprobar')
  @Roles('ADMIN')
  async approve(@Param('id', ParseIntPipe) id: number, @CurrentActorId() actorId: number) {
    await this.approveRequisition.execute({ id, actorId });
    return this.getRequisition.execute(id);
  }

  @Patch(':id/rechazar')
  @Roles('ADMIN')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequisitionReasonDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.rejectRequisition.execute({ id, motivo: dto.motivo, actorId });
    return this.getRequisition.execute(id);
  }

  @Patch(':id/cancelar')
  @Roles('ADMIN')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequisitionReasonDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.cancelRequisition.execute({ id, motivo: dto.motivo, actorId });
    return this.getRequisition.execute(id);
  }

  @Post(':id/recepciones')
  @Roles(...OPERATIVE_ROLES)
  async receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterRequisitionReceiptDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.registerReceipt.execute({
      requisicionId: id,
      ...dto,
      actorId,
    });
    return { result, requisicion: await this.getRequisition.execute(id) };
  }
}
