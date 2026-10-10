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
import { AddPaymentProofUseCase } from '../../application/use-cases/add-payment-proof.use-case';
import { ApplyPaymentUseCase } from '../../application/use-cases/apply-payment.use-case';
import { PaymentBankCommands } from '../../application/use-cases/payment-bank.commands';
import {
  GetPaymentSummaryUseCase,
  GetPaymentUseCase,
  ListPaymentApplicationsUseCase,
  ListPaymentBanksAdminUseCase,
  ListPaymentBanksUseCase,
  ListPaymentEventsUseCase,
  ListPaymentsUseCase,
  ListReceivableCandidatesUseCase,
} from '../../application/use-cases/read.use-cases';
import { RegisterPaymentUseCase } from '../../application/use-cases/register-payment.use-case';
import { RejectPaymentUseCase } from '../../application/use-cases/reject-payment.use-case';
import { ReversePaymentApplicationUseCase } from '../../application/use-cases/reverse-payment-application.use-case';
import { VerifyPaymentUseCase } from '../../application/use-cases/verify-payment.use-case';
import { VoidPaymentUseCase } from '../../application/use-cases/void-payment.use-case';
import {
  AddPaymentProofDto,
  ApplyPaymentDto,
  CreatePaymentBankDto,
  PaymentActionDto,
  PaymentListDto,
  PaymentPageDto,
  PaymentRangeDto,
  PaymentReasonActionDto,
  RegisterPaymentDto,
  UpdatePaymentBankDto,
} from './dto/payment-http.dto';
import { PaymentExceptionFilter } from './payment-exception.filter';

const READ = ['ADMIN', 'CONTABILIDAD', 'VENDEDOR'] as const;
const REGISTER = ['ADMIN', 'CONTABILIDAD', 'VENDEDOR'] as const;
const OPERATE = ['ADMIN', 'CONTABILIDAD'] as const;

@Controller('pagos')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(PaymentExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class PaymentController {
  constructor(
    private readonly registerUse: RegisterPaymentUseCase,
    private readonly proofUse: AddPaymentProofUseCase,
    private readonly verifyUse: VerifyPaymentUseCase,
    private readonly rejectUse: RejectPaymentUseCase,
    private readonly applyUse: ApplyPaymentUseCase,
    private readonly reverseUse: ReversePaymentApplicationUseCase,
    private readonly voidUse: VoidPaymentUseCase,
    private readonly listUse: ListPaymentsUseCase,
    private readonly getUse: GetPaymentUseCase,
    private readonly eventsUse: ListPaymentEventsUseCase,
    private readonly applicationsUse: ListPaymentApplicationsUseCase,
    private readonly banksUse: ListPaymentBanksUseCase,
    private readonly banksAdminUse: ListPaymentBanksAdminUseCase,
    private readonly bankCommands: PaymentBankCommands,
    private readonly candidatesUse: ListReceivableCandidatesUseCase,
    private readonly summaryUse: GetPaymentSummaryUseCase,
  ) {}

  @Get()
  @Roles(...READ)
  list(
    @Query() query: PaymentListDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.listUse.execute(query, actorId);
  }

  @Get('bancos')
  @Roles(...READ)
  banks(@CurrentActorId() actorId: number) {
    return this.banksUse.execute(actorId);
  }

  @Get('bancos/administracion')
  @Roles(...OPERATE)
  banksAdmin(@CurrentActorId() actorId: number) {
    return this.banksAdminUse.execute(actorId);
  }

  @Post('bancos')
  @Roles(...OPERATE)
  createBank(
    @Body() dto: CreatePaymentBankDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.bankCommands.create({ ...dto, actorId });
  }

  @Patch('bancos/:bancoId')
  @Roles(...OPERATE)
  updateBank(
    @Param('bancoId', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentBankDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.bankCommands.update({ id, ...dto, actorId });
  }

  @Get('resumen')
  @Roles(...READ)
  summary(
    @Query() query: PaymentRangeDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.summaryUse.execute(query, actorId);
  }

  @Post()
  @Roles(...REGISTER)
  async register(
    @Body() dto: RegisterPaymentDto,
    @CurrentActorId() actorId: number,
  ) {
    const payment = await this.registerUse.execute({
      ...dto,
      actorId,
    });

    return this.getUse.execute(payment.id, actorId);
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
    @Query() query: PaymentPageDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.eventsUse.execute(
      id,
      query.page,
      query.limit,
      actorId,
    );
  }

  @Get(':id/aplicaciones')
  @Roles(...READ)
  applications(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaymentPageDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.applicationsUse.execute(
      id,
      query.page,
      query.limit,
      actorId,
    );
  }

  @Get(':id/cuentas-candidatas')
  @Roles(...READ)
  candidates(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaymentPageDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.candidatesUse.execute(
      id,
      query.page,
      query.limit,
      actorId,
    );
  }

  @Post(':id/comprobantes')
  @Roles(...REGISTER)
  async addProof(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddPaymentProofDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.proofUse.execute({
      id,
      actorId,
      ...dto,
    });

    return this.getUse.execute(id, actorId);
  }

  @Post(':id/verificar')
  @Roles(...OPERATE)
  async verify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentActionDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.verifyUse.execute({
      id,
      actorId,
      ...dto,
    });

    return this.getUse.execute(id, actorId);
  }

  @Post(':id/rechazar')
  @Roles(...OPERATE)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentReasonActionDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.rejectUse.execute({
      id,
      actorId,
      ...dto,
    });

    return this.getUse.execute(id, actorId);
  }

  @Post(':id/aplicaciones')
  @Roles(...OPERATE)
  async apply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyPaymentDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.applyUse.execute({
      id,
      actorId,
      ...dto,
    });

    return this.getUse.execute(id, actorId);
  }

  @Post(':pagoId/aplicaciones/:aplicacionId/revertir')
  @Roles(...OPERATE)
  async reverse(
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @Param('aplicacionId', ParseIntPipe) aplicacionId: number,
    @Body() dto: PaymentReasonActionDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.reverseUse.execute({
      pagoId,
      aplicacionId,
      actorId,
      ...dto,
    });

    return this.getUse.execute(pagoId, actorId);
  }

  @Post(':id/anular')
  @Roles(...OPERATE)
  async voidPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaymentReasonActionDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.voidUse.execute({
      id,
      actorId,
      ...dto,
    });

    return this.getUse.execute(id, actorId);
  }
}
