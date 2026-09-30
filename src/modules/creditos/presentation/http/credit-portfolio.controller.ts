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
import { CreditQueries } from '../../application/use-cases/credit-queries';
import { CreditPortfolioQueryDto } from './dto/credit-http.dto';
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
  constructor(private readonly queries: CreditQueries) {}

  @Get('cartera')
  @Roles('ADMIN', 'VENDEDOR', 'CONTABILIDAD')
  portfolio(
    @Query() query: CreditPortfolioQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.portfolio(query, actorId);
  }
}
