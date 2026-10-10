import {
  Body, Controller, Get, Param, ParseIntPipe, Post,
  UseFilters, UseGuards, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { ComprobanteUseCases } from '../../application/use-cases/comprobante.use-cases';
import { ComprobanteExceptionFilter } from './comprobante-exception.filter';
import { RegistrarAccionDto } from './dto/comprobante-http.dto';

/**
 * No hay restricciones por rol para lectura/emision: la UI organiza sus acciones.
 * El backend SI valida siempre identidad activa y pertenencia a empresa.
 */
@Controller('comprobantes')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(ComprobanteExceptionFilter)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ComprobanteController {
  constructor(private readonly cases: ComprobanteUseCases) {}

  @Get('despachos/:despachoId/salidas/:operacionId/vista-previa')
  previewSalida(
    @Param('despachoId', ParseIntPipe) despachoId: number,
    @Param('operacionId', ParseIntPipe) operacionId: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.cases.preview({ tipo: 'SALIDA_DESPACHO', despachoId, id: operacionId }, actorId);
  }

  @Post('despachos/:despachoId/salidas/:operacionId/emitir')
  issueSalida(
    @Param('despachoId', ParseIntPipe) despachoId: number,
    @Param('operacionId', ParseIntPipe) operacionId: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.cases.issue({ tipo: 'SALIDA_DESPACHO', despachoId, id: operacionId }, actorId);
  }

  @Get('entregas/:entregaId/vista-previa')
  previewEntrega(
    @Param('entregaId', ParseIntPipe) entregaId: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.cases.preview({ tipo: 'ENTREGA', id: entregaId }, actorId);
  }

  @Post('entregas/:entregaId/emitir')
  issueEntrega(
    @Param('entregaId', ParseIntPipe) entregaId: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.cases.issue({ tipo: 'ENTREGA', id: entregaId }, actorId);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentActorId() actorId: number) {
    return this.cases.get(id, actorId);
  }

  @Post(':id/acciones')
  action(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RegistrarAccionDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.cases.action(id, actorId, body);
  }
}
