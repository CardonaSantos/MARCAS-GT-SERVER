import {
  BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException,
  Param, ParseIntPipe, Patch, Post, Query, UploadedFile,
  UseFilters, UseGuards, UseInterceptors, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { FILE_STORAGE_PORT, FileStoragePort } from '../../../archivos';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import { CreateDeliveryUseCase } from '../../application/use-cases/create-delivery.use-case';
import { StartDeliveryUseCase } from '../../application/use-cases/start-delivery.use-case';
import { UpdateDeliveryResultUseCase } from '../../application/use-cases/update-delivery-result.use-case';
import { AddDeliveryEvidenceUseCase, RemoveDeliveryEvidenceUseCase } from '../../application/use-cases/evidence.use-cases';
import { FinalizeDeliveryUseCase } from '../../application/use-cases/finalize-delivery.use-case';
import { AddDeliveryObservationUseCase } from '../../application/use-cases/add-delivery-observation.use-case';
import {
  GetDeliveryOperationalReportUseCase, GetDeliverySummaryUseCase, GetDeliveryUseCase,
  ListDeliveriesUseCase, ListDeliveryCandidatesUseCase, ListDeliveryEventsUseCase,
  ListDeliveryEvidenceUseCase,
} from '../../application/use-cases/read.use-cases';
import { DeliveryExceptionFilter } from './delivery-exception.filter';
import {
  AddDeliveryEvidenceDto, CreateDeliveryDto, DeliveryCandidateDto, DeliveryEventQueryDto,
  DeliveryListDto, DeliveryObservationDto, DeliveryRangeDto, FinalizeDeliveryDto,
  StartDeliveryDto, UpdateDeliveryResultDto,
} from './dto/delivery-http.dto';

const READ = ['ADMIN','BODEGA','CONTABILIDAD','VENDEDOR','REPARTIDOR'] as const;
const OPERATE = ['ADMIN','BODEGA','REPARTIDOR'] as const;

@Controller('entregas')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(DeliveryExceptionFilter)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class DeliveryController {
  constructor(
    private readonly createUse: CreateDeliveryUseCase,
    private readonly startUse: StartDeliveryUseCase,
    private readonly resultUse: UpdateDeliveryResultUseCase,
    private readonly addEvidenceUse: AddDeliveryEvidenceUseCase,
    private readonly removeEvidenceUse: RemoveDeliveryEvidenceUseCase,
    private readonly finalizeUse: FinalizeDeliveryUseCase,
    private readonly observationUse: AddDeliveryObservationUseCase,
    private readonly listUse: ListDeliveriesUseCase,
    private readonly candidatesUse: ListDeliveryCandidatesUseCase,
    private readonly getUse: GetDeliveryUseCase,
    private readonly eventsUse: ListDeliveryEventsUseCase,
    private readonly evidenceUse: ListDeliveryEvidenceUseCase,
    private readonly summaryUse: GetDeliverySummaryUseCase,
    private readonly reportUse: GetDeliveryOperationalReportUseCase,
    @Inject(FILE_STORAGE_PORT) private readonly files: FileStoragePort,
  ) {}

  @Get() @Roles(...READ)
  list(@Query() q: DeliveryListDto, @CurrentActorId() actorId: number) { return this.listUse.execute(q, actorId); }

  @Get('candidatos') @Roles(...OPERATE)
  candidates(@Query() q: DeliveryCandidateDto, @CurrentActorId() actorId: number) { return this.candidatesUse.execute(q, actorId); }

  @Get('resumen') @Roles(...READ)
  summary(@Query() q: DeliveryRangeDto, @CurrentActorId() actorId: number) { return this.summaryUse.execute(q, actorId); }

  @Get('reportes/operacion') @Roles('ADMIN','BODEGA','CONTABILIDAD')
  report(@Query() q: DeliveryRangeDto, @CurrentActorId() actorId: number) { return this.reportUse.execute(q, actorId); }

  @Post() @Roles(...OPERATE)
  async create(@Body() dto: CreateDeliveryDto, @CurrentActorId() actorId: number) {
    const created = await this.createUse.execute({ ...dto, actorId });
    return this.getUse.execute(created.id, actorId);
  }

  @Get(':id') @Roles(...READ)
  get(@Param('id', ParseIntPipe) id: number, @CurrentActorId() actorId: number) { return this.getUse.execute(id, actorId); }

  @Get(':id/eventos') @Roles(...READ)
  events(@Param('id', ParseIntPipe) id: number, @Query() q: DeliveryEventQueryDto, @CurrentActorId() actorId: number) {
    return this.eventsUse.execute(id, q, actorId);
  }

  @Get(':id/evidencias') @Roles(...READ)
  evidence(@Param('id', ParseIntPipe) id: number, @CurrentActorId() actorId: number) { return this.evidenceUse.execute(id, actorId); }

  @Post(':id/iniciar') @Roles(...OPERATE)
  async start(@Param('id', ParseIntPipe) id: number, @Body() dto: StartDeliveryDto, @CurrentActorId() actorId: number) {
    await this.startUse.execute({ id, ...dto, actorId });
    return this.getUse.execute(id, actorId);
  }

  @Patch(':id/resultado') @Roles(...OPERATE)
  async result(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeliveryResultDto, @CurrentActorId() actorId: number) {
    await this.resultUse.execute({ id, ...dto, actorId });
    return this.getUse.execute(id, actorId);
  }

  // Carga binaria: mismo UploadFileUseCase y bucket privado usados por Pagos.
  @Post(':id/evidencias/archivo') @Roles(...OPERATE)
  @UseInterceptors(FileInterceptor('archivo', {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  async uploadEvidenceFile(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
    @UploadedFile() archivo: { buffer: Buffer; originalname: string } | undefined,
    @Body('tipo') tipo: string,
    @Body('descripcion') descripcion: string | undefined,
    @Body('claveIdempotencia') claveIdempotencia: string,
  ) {
    if (!archivo?.buffer) {
      throw new BadRequestException('Selecciona una imagen o PDF de evidencia.');
    }
    if (!['FIRMA', 'FOTO', 'DOCUMENTO', 'OTRO'].includes(tipo)) {
      throw new BadRequestException('Tipo de evidencia inválido.');
    }
    if (!claveIdempotencia || claveIdempotencia.length < 8 || claveIdempotencia.length > 200) {
      throw new BadRequestException('Clave de idempotencia inválida.');
    }
    if ((descripcion ?? '').length > 1000) {
      throw new BadRequestException('Descripción demasiado larga.');
    }
    const evidence = await this.addEvidenceUse.execute(id, {
      tipo, buffer: archivo.buffer, filename: archivo.originalname,
      descripcion: descripcion?.trim() || archivo.originalname,
      claveIdempotencia,
    }, actorId);
    return { evidence, entrega: await this.getUse.execute(id, actorId) };
  }

  @Get(':id/evidencias/:evidenciaId/archivo') @Roles(...READ)
  async evidenceAccess(
    @Param('id', ParseIntPipe) id: number,
    @Param('evidenciaId', ParseIntPipe) evidenciaId: number,
    @CurrentActorId() actorId: number,
  ) {
    // GetDeliveryUseCase verifica pertenencia a empresa y scope del usuario.
    const delivery = await this.getUse.execute(id, actorId);
    const evidence = delivery.evidencias.items.find((item: { id: number }) => item.id === evidenciaId);
    if (!evidence) throw new NotFoundException('Evidencia no encontrada.');
    if (evidence.url.startsWith('spaces://')) {
      const expected = new RegExp('^marcas-gt/empresas/\\d+/entregas/' + id + '/evidencias/');
      if (!evidence.key || !expected.test(evidence.key) ||
          evidence.url !== 'spaces://' + evidence.key) {
        throw new BadRequestException('Referencia privada de evidencia inválida.');
      }
      return { url: await this.files.signedReadUrl(evidence.key, 60), mimeType: evidence.mimeType };
    }
    // Compatibilidad de lectura con evidencias históricas de Cloudinary.
    if (/^https:\/\//i.test(evidence.url)) {
      return { url: evidence.url, mimeType: evidence.mimeType };
    }
    throw new BadRequestException('Esta evidencia antigua no tiene una URL segura disponible.');
  }

  // Sólo las firmas JPG/PNG almacenadas en Spaces se pueden incrustar.
  // La lectura se hace en el servidor para no depender del CORS del bucket.
  @Get(':id/evidencias/:evidenciaId/imagen') @Roles(...READ)
  async evidenceImageForReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Param('evidenciaId', ParseIntPipe) evidenciaId: number,
    @CurrentActorId() actorId: number,
  ) {
    const delivery = await this.getUse.execute(id, actorId);
    const evidence = delivery.evidencias.items.find((item: { id: number }) => item.id === evidenciaId);
    if (!evidence || evidence.tipo !== 'FIRMA' ||
        !evidence.url.startsWith('spaces://') ||
        !['image/jpeg', 'image/png'].includes(evidence.mimeType ?? '')) {
      throw new BadRequestException('La firma no permite vista previa incrustada.');
    }
    const file = await this.evidenceAccess(id, evidenciaId, actorId);
    const response = await fetch(file.url);
    if (!response.ok ||
        Number(response.headers.get('content-length') || 0) > 10 * 1024 * 1024) {
      throw new BadRequestException('La firma privada no está disponible.');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException('La firma es demasiado grande.');
    }
    return { dataUrl: 'data:' + evidence.mimeType + ';base64,' + buffer.toString('base64') };
  }

  @Post(':id/evidencias') @Roles(...OPERATE)
  async addEvidence(@Param('id', ParseIntPipe) id: number, @Body() dto: AddDeliveryEvidenceDto, @CurrentActorId() actorId: number) {
    const evidence = await this.addEvidenceUse.execute(id, dto, actorId);
    return { evidence, entrega: await this.getUse.execute(id, actorId) };
  }

  @Delete(':id/evidencias/:evidenciaId') @Roles(...OPERATE)
  async removeEvidence(@Param('id', ParseIntPipe) id: number, @Param('evidenciaId', ParseIntPipe) evidenciaId: number, @CurrentActorId() actorId: number) {
    await this.removeEvidenceUse.execute(id, evidenciaId, actorId);
    return this.getUse.execute(id, actorId);
  }

  @Post(':id/finalizar') @Roles(...OPERATE)
  async finalize(@Param('id', ParseIntPipe) id: number, @Body() dto: FinalizeDeliveryDto, @CurrentActorId() actorId: number) {
    await this.finalizeUse.execute({ id, ...dto, actorId });
    return this.getUse.execute(id, actorId);
  }

  @Post(':id/observaciones') @Roles(...OPERATE)
  async observation(@Param('id', ParseIntPipe) id: number, @Body() dto: DeliveryObservationDto, @CurrentActorId() actorId: number) {
    await this.observationUse.execute(id, dto.detalle, dto.claveIdempotencia, actorId);
    return this.getUse.execute(id, actorId);
  }
}
