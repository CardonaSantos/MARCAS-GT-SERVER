import {
  Controller,
  Get,
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
import {
  GetReceivableSummaryUseCase,
  ListReceivablesUseCase,
} from '../../application/use-cases/read.use-cases';
import { BillingExceptionFilter } from './billing-exception.filter';
import { BillingRangeDto, ReceivableListDto } from './dto/billing-http.dto';

@Controller('cuentas-por-cobrar')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(BillingExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ReceivableController {
  constructor(
    private readonly listUse: ListReceivablesUseCase,
    private readonly summaryUse: GetReceivableSummaryUseCase,
  ) {}

  @Get()
  @Roles('ADMIN', 'CONTABILIDAD', 'VENDEDOR')
  list(@Query() query: ReceivableListDto, @CurrentActorId() actorId: number) {
    return this.listUse.execute(query, actorId);
  }

  @Get('resumen')
  @Roles('ADMIN', 'CONTABILIDAD', 'VENDEDOR')
  summary(@Query() query: BillingRangeDto, @CurrentActorId() actorId: number) {
    return this.summaryUse.execute(query, actorId);
  }
}
