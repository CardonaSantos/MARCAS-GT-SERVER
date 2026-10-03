import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import { FiscalConfigCommands } from '../../application/use-cases/fiscal-config.use-cases';
import { BillingExceptionFilter } from './billing-exception.filter';
import {
  CompanyFiscalProfileDto,
  CustomerFiscalProfileDto,
  EstablishmentFiscalDto,
  ProductFiscalProfileDto,
} from './dto/billing-http.dto';

@Controller('configuracion-fiscal')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(BillingExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class FiscalConfigController {
  constructor(private readonly commands: FiscalConfigCommands) {}

  @Put('empresa')
  @Roles('ADMIN')
  company(
    @Body() dto: CompanyFiscalProfileDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.commands.upsertCompany(dto, actorId);
  }

  @Post('establecimientos')
  @Roles('ADMIN')
  establishment(
    @Body() dto: EstablishmentFiscalDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.commands.createEstablishment(dto, actorId);
  }

  @Put('clientes/:clienteId')
  @Roles('ADMIN', 'CONTABILIDAD')
  customer(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Body() dto: CustomerFiscalProfileDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.commands.upsertCustomer({ clienteId, ...dto }, actorId);
  }

  @Put('productos/:productoId')
  @Roles('ADMIN', 'CONTABILIDAD')
  product(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Body() dto: ProductFiscalProfileDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.commands.upsertProduct({ productoId, ...dto }, actorId);
  }
}
