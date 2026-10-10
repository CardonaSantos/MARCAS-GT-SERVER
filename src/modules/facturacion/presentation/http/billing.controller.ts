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
import { CreateInvoiceFromDeliveriesUseCase } from '../../application/use-cases/create-invoice-from-deliveries.use-case';
import { DiscardInvoiceUseCase } from '../../application/use-cases/discard-invoice.use-case';
import { PrepareInvoiceUseCase } from '../../application/use-cases/prepare-invoice.use-case';
import {
  GetBillingOperationalReportUseCase,
  GetBillingSummaryUseCase,
  GetInvoiceUseCase,
  ListBillingCandidatesUseCase,
  ListFelOperationsUseCase,
  ListInvoiceEventsUseCase,
  ListInvoicesUseCase,
} from '../../application/use-cases/read.use-cases';
import { BillingExceptionFilter } from './billing-exception.filter';
import {
  BillingCandidateDto,
  BillingRangeDto,
  CreateInvoiceDto,
  DiscardInvoiceDto,
  InvoiceListDto,
  PageDto,
  PrepareInvoiceDto,
} from './dto/billing-http.dto';

const READ = ['ADMIN', 'CONTABILIDAD', 'VENDEDOR'] as const;
const OPERATE = ['ADMIN', 'CONTABILIDAD'] as const;

@Controller('facturas')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(BillingExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class BillingController {
  constructor(
    private readonly createUse: CreateInvoiceFromDeliveriesUseCase,
    private readonly discardUse: DiscardInvoiceUseCase,
    private readonly prepareUse: PrepareInvoiceUseCase,
    private readonly listUse: ListInvoicesUseCase,
    private readonly candidatesUse: ListBillingCandidatesUseCase,
    private readonly getUse: GetInvoiceUseCase,
    private readonly eventsUse: ListInvoiceEventsUseCase,
    private readonly operationsUse: ListFelOperationsUseCase,
    private readonly summaryUse: GetBillingSummaryUseCase,
    private readonly reportUse: GetBillingOperationalReportUseCase,
  ) {}

  @Get()
  @Roles(...READ)
  list(@Query() query: InvoiceListDto, @CurrentActorId() actorId: number) {
    return this.listUse.execute(query, actorId);
  }

  @Get('candidatos')
  @Roles(...READ)
  candidates(
    @Query() query: BillingCandidateDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.candidatesUse.execute(query, actorId);
  }

  @Get('resumen')
  @Roles(...READ)
  summary(@Query() query: BillingRangeDto, @CurrentActorId() actorId: number) {
    return this.summaryUse.execute(query, actorId);
  }

  @Get('reportes/operacion')
  @Roles('ADMIN', 'CONTABILIDAD')
  report(@Query() query: BillingRangeDto, @CurrentActorId() actorId: number) {
    return this.reportUse.execute(query, actorId);
  }

  @Post()
  @Roles(...OPERATE)
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentActorId() actorId: number,
  ) {
    const created = await this.createUse.execute({ ...dto, actorId });
    return this.getUse.execute(created.id, actorId);
  }

  @Get(':id')
  @Roles(...READ)
  get(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.getUse.execute(id, actorId);
  }

  @Get(':id/eventos')
  @Roles(...READ)
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PageDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.eventsUse.execute(id, query.page, query.limit, actorId);
  }

  @Get(':id/operaciones-fel')
  @Roles(...READ)
  operations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PageDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.operationsUse.execute(id, query.page, query.limit, actorId);
  }

  @Post(':id/preparar')
  @Roles(...OPERATE)
  async prepare(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrepareInvoiceDto,
    @CurrentActorId() actorId: number,
  ) {
    const document = await this.prepareUse.execute({ id, ...dto, actorId });
    return {
      documentoFiscal: document,
      factura: await this.getUse.execute(id, actorId),
      integracionFel: {
        habilitada: false,
        proveedorPreferido: 'GRUPO_CDS',
        mensaje:
          'La certificación real queda pendiente de credenciales y contratación del proveedor.',
      },
    };
  }

  @Post(':id/descartar')
  @Roles(...OPERATE)
  async discard(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiscardInvoiceDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.discardUse.execute({ id, ...dto, actorId });
    return this.getUse.execute(id, actorId);
  }
}
