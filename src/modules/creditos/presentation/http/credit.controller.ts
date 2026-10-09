import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { FILE_STORAGE_PORT, FileStoragePort, UploadFileUseCase, InvalidUploadError } from '../../../archivos';
import { CreditDocumentType } from '../../credit.types';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import { CreditApplicationCommands } from '../../application/use-cases/credit-application.commands';
import { CreditDecisionCommands } from '../../application/use-cases/credit-decision.commands';
import { CreditEvidenceCommands } from '../../application/use-cases/credit-evidence.commands';
import { ApproveCreditWithScheduleUseCase } from '../../application/use-cases/approve-credit-with-schedule.use-case';
import { CreditQueries } from '../../application/use-cases/credit-queries';
import {
  AddCreditDocumentDto,
  AddCreditReferenceDto,
  ApproveCreditDto,
  ApproveCreditWithScheduleDto,
  CreateCreditApplicationDto,
  RequestCreditFromOrderDto,
  CreditEventQueryDto,
  CreditListQueryDto,
  CreditReasonDto,
  CreditSummaryQueryDto,
  ReviewCreditDocumentDto,
  ReviewCreditReferenceDto,
  ReviewCreditRequirementDto,
  UpdateCreditApplicationDto,
  UpdateCreditReferenceDto,
} from './dto/credit-http.dto';
import { CreditExceptionFilter } from './credit-exception.filter';

const READ_ROLES = ['ADMIN', 'VENDEDOR', 'BODEGA', 'CONTABILIDAD'] as const;
const WRITE_ROLES = ['ADMIN', 'VENDEDOR', 'BODEGA'] as const;
const REVIEW_ROLES = ['ADMIN'] as const;

@Controller('creditos/solicitudes')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(CreditExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CreditController {
  constructor(
    private readonly applications: CreditApplicationCommands,
    private readonly evidence: CreditEvidenceCommands,
    private readonly decisions: CreditDecisionCommands,
    private readonly queries: CreditQueries,
    private readonly schedule: ApproveCreditWithScheduleUseCase,
    private readonly uploader: UploadFileUseCase,
    @Inject(FILE_STORAGE_PORT) private readonly privateFiles: FileStoragePort,
  ) {}

  @Post()
  @Roles(...WRITE_ROLES)
  async create(
    @Body() dto: CreateCreditApplicationDto,
    @CurrentActorId() actorId: number,
  ) {
    const created = await this.applications.create({ ...dto, actorId });
    if (!created.id) throw new Error('La solicitud persistida no tiene id.');
    return this.queries.get(created.id, actorId);
  }

  @Post('desde-pedido/:pedidoId/solicitar')
  @Roles(...WRITE_ROLES)
  async requestFromOrder(
    @Param('pedidoId', ParseIntPipe) pedidoId: number,
    @Body() dto: RequestCreditFromOrderDto,
    @CurrentActorId() actorId: number,
  ) {
    const application = await this.applications.requestFromOrder({
      ...dto, pedidoId, actorId,
    });
    if (!application.id) throw new Error('La solicitud no tiene id.');
    return this.queries.get(application.id, actorId);
  }

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query() query: CreditListQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.list(query as any, actorId);
  }

  @Get('resumen')
  @Roles(...READ_ROLES)
  summary(
    @Query() query: CreditSummaryQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.summary(query as any, actorId);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.get(id, actorId);
  }

  @Get(':id/eventos')
  @Roles(...READ_ROLES)
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CreditEventQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.queries.events(id, query as any, actorId);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCreditApplicationDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.applications.update({ id, ...dto, actorId });
    return this.queries.get(id, actorId);
  }

  @Patch(':id/enviar-revision')
  @Roles(...WRITE_ROLES)
  async submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    await this.applications.submit(id, actorId);
    return this.queries.get(id, actorId);
  }

  @Patch(':id/cancelar')
  @Roles(...WRITE_ROLES)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreditReasonDto,
    @CurrentActorId() actorId: number,
  ) {
    const operation = await this.applications.cancel(
      id,
      dto.motivo,
      dto.claveIdempotencia,
      actorId,
    );
    return {
      operation,
      solicitud: await this.queries.get(id, actorId),
    };
  }

  @Post(':id/referencias')
  @Roles(...WRITE_ROLES)
  async addReference(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCreditReferenceDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.evidence.addReference(id, dto, actorId);
    return { result, solicitud: await this.queries.get(id, actorId) };
  }

  @Patch(':id/referencias/:referenciaId')
  @Roles(...WRITE_ROLES)
  async updateReference(
    @Param('id', ParseIntPipe) id: number,
    @Param('referenciaId', ParseIntPipe) referenciaId: number,
    @Body() dto: UpdateCreditReferenceDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.evidence.updateReference(id, referenciaId, dto, actorId);
    return this.queries.get(id, actorId);
  }

  @Patch(':id/referencias/:referenciaId/revisar')
  @Roles(...REVIEW_ROLES)
  async reviewReference(
    @Param('id', ParseIntPipe) id: number,
    @Param('referenciaId', ParseIntPipe) referenciaId: number,
    @Body() dto: ReviewCreditReferenceDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.evidence.reviewReference(
      id,
      referenciaId,
      dto.resultado,
      dto.observaciones,
      actorId,
    );
    return this.queries.get(id, actorId);
  }

  @Post(':id/documentos/archivo')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('archivo', {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  async uploadCreditDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
    @UploadedFile() archivo: { buffer: Buffer; originalname: string } | undefined,
    @Body('tipo') tipo: string,
    @Body('observaciones') observaciones: string | undefined,
  ) {
    const valid = ['DPI', 'NIT', 'ESTADO_CUENTA', 'CONSTANCIA_INGRESOS', 'PATENTE', 'OTRO'];
    if (!archivo?.buffer) throw new BadRequestException('Selecciona un archivo.');
    if (!valid.includes(tipo)) throw new BadRequestException('Tipo de documento inválido.');
    if ((observaciones ?? '').length > 500) {
      throw new BadRequestException('La descripción supera 500 caracteres.');
    }

    // Verifica acceso por tenant antes de colocar bytes en Spaces.
    const detail = await this.queries.get(id, actorId);
    if (!detail.acciones.puedeAgregarExpediente) {
      throw new BadRequestException('El expediente ya no admite documentos.');
    }
    const empresaId = await this.evidence.getAuthorizedCompanyId(id, actorId);
    const prefix = 'marcas-gt/empresas/' + empresaId +
      '/creditos/solicitudes/' + id + '/documentos/';
    let uploaded: Awaited<ReturnType<UploadFileUseCase['execute']>>;
    try {
      uploaded = await this.uploader.execute({
        buffer: archivo.buffer,
        filename: archivo.originalname,
        prefix,
      });
    } catch (error) {
      if (error instanceof InvalidUploadError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    try {
      const result = await this.evidence.addDocument(id, {
        tipo: tipo as CreditDocumentType,
        url: 'spaces://' + uploaded.key,
        key: uploaded.key,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        observaciones: observaciones?.trim() || uploaded.filename,
      }, actorId);
      return { result, solicitud: await this.queries.get(id, actorId) };
    } catch (error) {
      await this.privateFiles.remove(uploaded.key).catch(() => undefined);
      throw error;
    }
  }

  @Get(':id/documentos/:documentoId/archivo')
  @Roles(...READ_ROLES)
  async readCreditDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentoId', ParseIntPipe) documentoId: number,
    @CurrentActorId() actorId: number,
  ) {
    const detail = await this.queries.get(id, actorId);
    const document = detail.documentos.find((d: { id: number }) => d.id === documentoId);
    if (!document) throw new BadRequestException('Documento no encontrado.');
    if (document.url.startsWith('spaces://')) {
      const empresaId = await this.evidence.getAuthorizedCompanyId(id, actorId);
      const expectedPrefix = 'marcas-gt/empresas/' + empresaId +
        '/creditos/solicitudes/' + id + '/documentos/';
      if (!document.key?.startsWith(expectedPrefix) ||
          document.url !== 'spaces://' + document.key) {
        throw new BadRequestException('Referencia privada inválida.');
      }
      return { url: await this.privateFiles.signedReadUrl(document.key, 60) };
    }
    if (/^https:\/\//i.test(document.url)) return { url: document.url };
    throw new BadRequestException('El documento histórico no dispone de enlace HTTPS.');
  }

  @Post(':id/documentos')
  @Roles(...WRITE_ROLES)
  async addDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCreditDocumentDto,
    @CurrentActorId() actorId: number,
  ) {
    const result = await this.evidence.addDocument(id, dto, actorId);
    return { result, solicitud: await this.queries.get(id, actorId) };
  }

  @Patch(':id/documentos/:documentoId/revisar')
  @Roles(...REVIEW_ROLES)
  async reviewDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentoId', ParseIntPipe) documentoId: number,
    @Body() dto: ReviewCreditDocumentDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.evidence.reviewDocument(
      id,
      documentoId,
      dto.estado,
      dto.observaciones,
      actorId,
    );
    return this.queries.get(id, actorId);
  }

  @Patch(':id/requisitos/:requisitoId/revisar')
  @Roles(...REVIEW_ROLES)
  async reviewRequirement(
    @Param('id', ParseIntPipe) id: number,
    @Param('requisitoId', ParseIntPipe) requisitoId: number,
    @Body() dto: ReviewCreditRequirementDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.evidence.reviewRequirement(
      id,
      requisitoId,
      dto.estado,
      dto.observaciones,
      actorId,
    );
    return this.queries.get(id, actorId);
  }

  @Post(':id/aprobar-con-cuotas')
  @Roles('ADMIN')
  async approveAndSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveCreditWithScheduleDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.schedule.execute({ ...dto, id, actorId });
  }

  @Patch(':id/aprobar')
  @Roles(...REVIEW_ROLES)
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveCreditDto,
    @CurrentActorId() actorId: number,
  ) {
    const operation = await this.decisions.approve({ id, ...dto, actorId });
    return {
      operation,
      solicitud: await this.queries.get(id, actorId),
    };
  }

  @Patch(':id/rechazar')
  @Roles(...REVIEW_ROLES)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreditReasonDto,
    @CurrentActorId() actorId: number,
  ) {
    const operation = await this.decisions.reject({
      id,
      motivo: dto.motivo,
      claveIdempotencia: dto.claveIdempotencia,
      actorId,
    });
    return {
      operation,
      solicitud: await this.queries.get(id, actorId),
    };
  }

  @Post(':id/reintentar-integracion')
  @Roles(...REVIEW_ROLES)
  async retryIntegration(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    const operation = await this.decisions.retry(id, actorId);
    return {
      operation,
      solicitud: await this.queries.get(id, actorId),
    };
  }
}
