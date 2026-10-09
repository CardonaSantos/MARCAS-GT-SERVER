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
import { DateService } from './date.service';
import { AuthGuard } from '@nestjs/passport';
import { VisitWorkflowService } from './workflow/visit-workflow.service';
import { VisitStartDto, VisitFinishDto, VisitCancelDto } from './workflow/visit-workflow.dto';
import { CreateDateDto } from './dto/create-date.dto';
import { UpdateDateDto } from './dto/update-date.dto';

@Controller('date')
export class DateController {
  constructor(
    private readonly dateService: DateService,
    private readonly visits: VisitWorkflowService,
  ) {}

  // Contrato autenticado de visitas; rutas antiguas permanecen por compatibilidad.
  @Get('jornada/abierta')
  @UseGuards(AuthGuard('jwt'))
  findOwnOpen(@Req() req: { user: { userId: number } }) {
    return this.visits.open(Number(req.user.userId));
  }

  @Post('jornada')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  startOwn(
    @Req() req: { user: { userId: number } },
    @Body() dto: VisitStartDto,
  ) {
    return this.visits.start(Number(req.user.userId), dto);
  }

  @Patch('jornada/:id/finalizar')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  finishOwn(
    @Req() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VisitFinishDto,
  ) {
    return this.visits.finish(Number(req.user.userId), id, dto);
  }

  @Patch('jornada/:id/cancelar')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  cancelOwn(
    @Req() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VisitCancelDto,
  ) {
    return this.visits.cancel(Number(req.user.userId), id, dto);
  }

  @Post('/start-new-visit')
  create(@Body() createDateDto: CreateDateDto) {
    return this.dateService.create(createDateDto);
  }

  @Patch('/cancel/visit-regist/:id')
  cancelVisitRegist(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDateDto: UpdateDateDto,
  ) {
    return this.dateService.cancelRegistVisit(id, updateDateDto);
  }

  @Patch('/update/visit-regist/:id')
  updateVisitRegist(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDateDto: UpdateDateDto,
  ) {
    return this.dateService.updateVisitRegist(id, updateDateDto);
  }

  @Get('/regist-open/:id')
  findVisistRegistOpen(@Param('id', ParseIntPipe) id: number) {
    console.log('ENTRANDO AL CONTROLLER DEL GET RECUPERANDO EL REGISTRO, ', id);
    return this.dateService.getRegistOpen(id);
  }

  @Get('/get-visits-regists')
  findVisitsRegis() {
    return this.dateService.findVisitsRegis();
  }

  @Get()
  findAll() {
    return this.dateService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dateService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDateDto: UpdateDateDto) {
    return this.dateService.update(+id, updateDateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dateService.remove(+id);
  }
}
