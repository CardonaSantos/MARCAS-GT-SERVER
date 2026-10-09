import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProspectoService } from './prospecto.service';
import { AuthGuard } from '@nestjs/passport';
import { ProspectWorkflowService } from './workflow/prospect-workflow.service';
import {
  ProspectWorkflowStartDto, ProspectWorkflowFinishDto, ProspectWorkflowCancelDto,
} from './workflow/prospect-workflow.dto';

import { CreateProspectoDto } from './dto/create-prospecto.dto';
import { UpdateProspectoDto } from './dto/update-prospecto.dto';

@Controller('prospecto')
export class ProspectoController {
  constructor(
    private readonly prospectoService: ProspectoService,
    private readonly workflow: ProspectWorkflowService,
  ) {}
  @Get('jornada/abierto')
  @UseGuards(AuthGuard('jwt'))
  getOwnActive(@Req() req: { user: { userId: number } }) {
    return this.workflow.open(Number(req.user.userId));
  }

  @Post('jornada')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  startOwn(@Req() req: { user: { userId: number } }, @Body() dto: ProspectWorkflowStartDto) {
    return this.workflow.start(Number(req.user.userId), dto);
  }

  @Patch('jornada/:id/finalizar')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  finishOwn(@Req() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number, @Body() dto: ProspectWorkflowFinishDto) {
    return this.workflow.finish(Number(req.user.userId), id, dto);
  }

  @Patch('jornada/:id/cancelar')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  cancelOwn(@Req() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number, @Body() dto: ProspectWorkflowCancelDto) {
    return this.workflow.cancel(Number(req.user.userId), id, dto);
  }


  @Post()
  async create(@Body() createProspectoDto: CreateProspectoDto) {
    console.log('CREANDO PROSPECTO MAN');

    return await this.prospectoService.create(createProspectoDto);
  }

  @Get()
  async findAll() {
    return await this.prospectoService.findAll();
  }

  @Get('/get-prospectos-cancelados/:id')
  async findAllMyCancelProspects(@Param('id', ParseIntPipe) id: number) {
    return await this.prospectoService.findAllMyCancelProspects(id);
  }

  @Get('/prospecto-ubicaciones')
  async findAllUbications() {
    return await this.prospectoService.getUbicationesProspecto();
  }
  //VERIFICAR PROSPECTO ABIERTO Y RETORNAR PARA HACER LA VALIDACION
  @Get('/abierto/:id')
  async finLastProspect(@Param('id', ParseIntPipe) id: number) {
    return await this.prospectoService.ultimoProspectoAbierto(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prospectoService.findOne(+id);
  }

  @Patch('/actualizar-prospecto/:id')
  updateProspecto(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProspectoDto: UpdateProspectoDto,
  ) {
    console.log('Entrando al controller de actualizacion ');
    console.log('La data del prospecto actualizado es: ', updateProspectoDto);
    return this.prospectoService.updateProspecto(id, updateProspectoDto);
  }

  @Patch('/cancelar-prospecto/:id')
  async cancelarProspecto(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProspectoDto: UpdateProspectoDto,
  ) {
    console.log('Cancelando prospecto con ID:', id);
    return await this.prospectoService.cancelarProspecto(
      id,
      updateProspectoDto,
    );
  }

  @Delete('/delete-all')
  removeAll() {
    return this.prospectoService.removeAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prospectoService.remove(+id);
  }
}
