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
import { CreditApplicationCommands } from '../../application/use-cases/credit-application.commands';
import { CreditDecisionCommands } from '../../application/use-cases/credit-decision.commands';
import { CreditEvidenceCommands } from '../../application/use-cases/credit-evidence.commands';
import { CreditQueries } from '../../application/use-cases/credit-queries';
import {
  AddCreditDocumentDto,
  AddCreditReferenceDto,
  ApproveCreditDto,
  CreateCreditApplicationDto,
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

const READ_ROLES = ['ADMIN', 'VENDEDOR', 'CONTABILIDAD'] as const;
const WRITE_ROLES = ['ADMIN', 'VENDEDOR'] as const;
const REVIEW_ROLES = ['ADMIN', 'CONTABILIDAD'] as const;

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
