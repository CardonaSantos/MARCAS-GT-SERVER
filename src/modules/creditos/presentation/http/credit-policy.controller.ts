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
import { CreditPolicyCommands } from '../../application/use-cases/credit-policy.commands';
import { CreditQueries } from '../../application/use-cases/credit-queries';
import {
  CreateCreditPolicyDto,
  CreditPolicyListQueryDto,
  CreditPolicyStatusDto,
  UpdateCreditPolicyDto,
} from './dto/credit-http.dto';
import { CreditExceptionFilter } from './credit-exception.filter';

@Controller('creditos/politicas')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(CreditExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CreditPolicyController {
  constructor(
    private readonly policies: CreditPolicyCommands,
    private readonly queries: CreditQueries,
  ) {}

  @Get()
  @Roles('ADMIN', 'CONTABILIDAD', 'VENDEDOR')
  list(
    @Query() query: CreditPolicyListQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.policies(query, actorId);
  }

  @Get(':id')
  @Roles('ADMIN', 'CONTABILIDAD', 'VENDEDOR')
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.policy(id, actorId);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @Body() dto: CreateCreditPolicyDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.policies.create({ ...dto, actorId });
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCreditPolicyDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.policies.update(id, dto, actorId);
  }

  @Patch(':id/estado')
  @Roles('ADMIN')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreditPolicyStatusDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.policies.setStatus(id, dto.activo, dto.motivo, actorId);
  }
}
