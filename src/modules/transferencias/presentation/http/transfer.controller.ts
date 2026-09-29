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
import { CancelTransferUseCase } from '../../application/use-cases/cancel-transfer.use-case';
import { CreateTransferUseCase } from '../../application/use-cases/create-transfer.use-case';
import { GetTransferSummaryUseCase } from '../../application/use-cases/get-transfer-summary.use-case';
import { GetTransferUseCase } from '../../application/use-cases/get-transfer.use-case';
import { ListTransferEventsUseCase } from '../../application/use-cases/list-transfer-events.use-case';
import { ListTransferOperationsUseCase } from '../../application/use-cases/list-transfer-operations.use-case';
import { ListTransfersUseCase } from '../../application/use-cases/list-transfers.use-case';
import { PrepareTransferUseCase } from '../../application/use-cases/prepare-transfer.use-case';
import { ReceiveTransferUseCase } from '../../application/use-cases/receive-transfer.use-case';
import { SendTransferUseCase } from '../../application/use-cases/send-transfer.use-case';
import { UpdateTransferUseCase } from '../../application/use-cases/update-transfer.use-case';
import {
  CreateTransferDto,
  RegisterTransferOutboundDto,
  RegisterTransferReceiptDto,
  TransferEventQueryDto,
  TransferListQueryDto,
  TransferOperationListQueryDto,
  TransferReasonDto,
  TransferSummaryQueryDto,
  UpdateTransferDto,
} from './dto/transfer-http.dto';
import { TransferExceptionFilter } from './transfer-exception.filter';

const READ_ROLES = ['ADMIN', 'BODEGA', 'CONTABILIDAD'] as const;
const OPERATIVE_ROLES = ['ADMIN', 'BODEGA'] as const;

@Controller('transferencias')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(TransferExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class TransferController {
  constructor(
    private readonly createTransfer: CreateTransferUseCase,
    private readonly updateTransfer: UpdateTransferUseCase,
    private readonly prepareTransfer: PrepareTransferUseCase,
    private readonly cancelTransfer: CancelTransferUseCase,
    private readonly sendTransfer: SendTransferUseCase,
    private readonly receiveTransfer: ReceiveTransferUseCase,
    private readonly listTransfers: ListTransfersUseCase,
    private readonly getTransfer: GetTransferUseCase,
    private readonly listEvents: ListTransferEventsUseCase,
    private readonly listOperations: ListTransferOperationsUseCase,
    private readonly getSummary: GetTransferSummaryUseCase,
  ) {}

  @Post()
  @Roles(...OPERATIVE_ROLES)
  async create(
    @Body() dto: CreateTransferDto,
    @CurrentActorId() actorId: number,
  ) {
    const created = await this.createTransfer.execute({
      ...dto,
      actorId,
    });

    if (!created.id) {
      throw new Error('La transferencia persistida no tiene id.');
    }

    return this.getTransfer.execute(created.id);
  }

  @Get()
  @Roles(...READ_ROLES)
  list(@Query() query: TransferListQueryDto) {
    return this.listTransfers.execute(query);
  }

  @Get('resumen')
  @Roles(...READ_ROLES)
  summary(@Query() query: TransferSummaryQueryDto) {
    return this.getSummary.execute(query);
  }

  @Get('operaciones')
  @Roles(...READ_ROLES)
  operations(@Query() query: TransferOperationListQueryDto) {
    return this.listOperations.execute(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.getTransfer.execute(id);
  }

  @Get(':id/eventos')
  @Roles(...READ_ROLES)
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: TransferEventQueryDto,
  ) {
    return this.listEvents.execute(id, query);
  }

  @Get(':id/operaciones')
  @Roles(...READ_ROLES)
  transferOperations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: TransferOperationListQueryDto,
  ) {
    return this.listOperations.execute({
      ...query,
      transferenciaId: id,
    });
  }

  @Patch(':id')
  @Roles(...OPERATIVE_ROLES)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransferDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.updateTransfer.execute({
      id,
      ...dto,
      actorId,
    });

    return this.getTransfer.execute(id);
  }

  @Patch(':id/preparar')
  @Roles(...OPERATIVE_ROLES)
  async prepare(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    await this.prepareTransfer.execute({ id, actorId });
    return this.getTransfer.execute(id);
  }

  @Patch(':id/cancelar')
  @Roles(...OPERATIVE_ROLES)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferReasonDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.cancelTransfer.execute({
      id,
      motivo: dto.motivo,
      actorId,
    });

    return this.getTransfer.execute(id);
  }

  @Post(':id/salidas')
  @Roles(...OPERATIVE_ROLES)
  async send(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterTransferOutboundDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.sendTransfer.execute({
      transferenciaId: id,
      ...dto,
      actorId,
    });

    return {
      result,
      transferencia: await this.getTransfer.execute(id),
    };
  }

  @Post(':id/recepciones')
  @Roles(...OPERATIVE_ROLES)
  async receive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterTransferReceiptDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.receiveTransfer.execute({
      transferenciaId: id,
      ...dto,
      actorId,
    });

    return {
      result,
      transferencia: await this.getTransfer.execute(id),
    };
  }
}
