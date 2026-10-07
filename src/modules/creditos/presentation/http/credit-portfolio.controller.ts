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
import { CreditPaymentPlanCommands } from '../../application/use-cases/credit-payment-plan.commands';
import { CreditQueries } from '../../application/use-cases/credit-queries';
import { CreditPortfolioQueryDto } from './dto/credit-http.dto';
import {
  ActivateCreditPaymentPlanDto,
  CreateCreditPaymentPlanDto,
  UpdateCreditPaymentPlanDto,
} from './dto/credit-payment-plan-http.dto';
import { CreditExceptionFilter } from './credit-exception.filter';

@Controller('creditos')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(CreditExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CreditPortfolioController {
  constructor(
    private readonly queries: CreditQueries,
    private readonly paymentPlans: CreditPaymentPlanCommands,
  ) {}

  @Get('cartera')
  @Roles('ADMIN', 'VENDEDOR', 'CONTABILIDAD')
  portfolio(
    @Query() query: CreditPortfolioQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.portfolio(query, actorId);
  }

  @Get('cartera/:id')
  @Roles('ADMIN', 'VENDEDOR', 'CONTABILIDAD')
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.portfolioDetail(id, actorId);
  }

  @Post('cartera/:id/plan-pagos')
  @Roles('ADMIN', 'CONTABILIDAD')
  createPaymentPlan(
    @Param('id', ParseIntPipe) creditoId: number,
    @Body() dto: CreateCreditPaymentPlanDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.paymentPlans.create({ creditoId, ...dto, actorId });
  }

  @Patch('cartera/:id/plan-pagos')
  @Roles('ADMIN', 'CONTABILIDAD')
  updatePaymentPlan(
    @Param('id', ParseIntPipe) creditoId: number,
    @Body() dto: UpdateCreditPaymentPlanDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.paymentPlans.update({ creditoId, ...dto, actorId });
  }

  @Post('cartera/:id/plan-pagos/activar')
  @Roles('ADMIN', 'CONTABILIDAD')
  activatePaymentPlan(
    @Param('id', ParseIntPipe) creditoId: number,
    @Body() dto: ActivateCreditPaymentPlanDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.paymentPlans.activate({ creditoId, ...dto, actorId });
  }
}
