import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SortDirection } from 'src/shared/application/pagination/page.models';
import { CreditSortField } from '../../../application/models/credit.models';
import {
  CreditApplicationState,
  CreditDecisionType,
  CreditDocumentState,
  CreditDocumentType,
  CreditEventType,
  CreditIntegrationState,
  CreditReferenceResult,
  CreditReferenceType,
  CreditRequirementState,
} from '../../../credit.types';

const trim = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim();
const money = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === ''
    ? value
    : String(value).trim();
const bool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if ([true, 1, '1', 'true'].includes(value as any)) return true;
  if ([false, 0, '0', 'false'].includes(value as any)) return false;
  return value;
};

export class CreateCreditApplicationDto {
  @Type(() => Number) @IsInt() @Min(1) pedidoId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) politicaId?: number | null;
  @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) montoSolicitado: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) plazoDias: number;
  @IsOptional() @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) anticipoPropuesto?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) motivo?: string | null;
}

export class RequestCreditFromOrderDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) plazoDias: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) politicaId?: number | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) motivo?: string | null;
}

export class UpdateCreditApplicationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) politicaId?: number | null;
  @IsOptional() @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) montoSolicitado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) plazoDias?: number;
  @IsOptional() @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) anticipoPropuesto?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) motivo?: string | null;
}

export class CreditReasonDto {
  @Transform(trim) @IsString() @Length(3, 1000) motivo: string;
  @Transform(trim) @IsString() @Length(8, 120) claveIdempotencia: string;
}

export class ApproveCreditDto {
  @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) montoAutorizado: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) plazoAutorizadoDias: number;
  @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) anticipoRequerido: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) observaciones?: string | null;
  @Transform(trim) @IsString() @Length(8, 120) claveIdempotencia: string;
}

export class ApproveCreditWithScheduleDto extends ApproveCreditDto {
  @Type(() => CreditScheduleDto)
  @ValidateNested()
  plan: CreditScheduleDto;
}

export class CreditScheduleDto {
  @IsIn(['SEMANAL', 'QUINCENAL', 'MENSUAL'])
  frecuencia: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
  @Type(() => Number) @IsInt() @Min(1) @Max(120) numeroCuotas: number;
  @Type(() => Date) @IsDate() primeraFechaVencimiento: Date;
}


export class AddCreditReferenceDto {
  @IsIn(['PERSONAL', 'COMERCIAL', 'LABORAL', 'OTRA']) tipo: CreditReferenceType;
  @Transform(trim) @IsString() @Length(2, 160) nombre: string;
  @Transform(trim) @IsString() @Length(3, 60) telefono: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) relacion?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) observaciones?: string | null;
}

export class UpdateCreditReferenceDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 160) nombre?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(3, 60) telefono?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) relacion?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) observaciones?: string | null;
}

export class ReviewCreditReferenceDto {
  @IsIn(['VERIFICADA', 'NO_VERIFICADA', 'RECHAZADA']) resultado: Exclude<CreditReferenceResult, 'PENDIENTE'>;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) observaciones?: string | null;
}

export class AddCreditDocumentDto {
  @IsIn(['DPI', 'NIT', 'ESTADO_CUENTA', 'CONSTANCIA_INGRESOS', 'PATENTE', 'OTRO']) tipo: CreditDocumentType;
  @Transform(trim) @IsString() @MaxLength(2000) url: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) key?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) mimeType?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) size?: number | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) observaciones?: string | null;
}

export class ReviewCreditDocumentDto {
  @IsIn(['VALIDADO', 'RECHAZADO']) estado: Exclude<CreditDocumentState, 'PENDIENTE'>;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) observaciones?: string | null;
}

export class ReviewCreditRequirementDto {
  @IsIn(['CUMPLIDO', 'NO_CUMPLE', 'EXONERADO']) estado: Exclude<CreditRequirementState, 'PENDIENTE'>;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) observaciones?: string | null;
}

export class CreditListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(['PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'CANCELADA']) estado?: CreditApplicationState;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) solicitanteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vendedorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) politicaId?: number;
  @IsOptional() @IsIn(['APROBADA', 'RECHAZADA', 'AJUSTADA']) tipoDecision?: CreditDecisionType;
  @IsOptional() @IsIn(['PENDIENTE', 'APLICADA', 'FALLIDA']) integracionEstado?: CreditIntegrationState;
  @IsOptional() @IsIn(['CREDITO', 'MIXTO']) condicionPago?: 'CREDITO' | 'MIXTO';
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
  @IsOptional() @Transform(bool) @IsBoolean() soloPendientes?: boolean;
  @IsOptional() @IsIn(['solicitadaEn', 'actualizadoEn', 'numero', 'estado', 'cliente', 'vendedor', 'solicitante', 'montoSolicitado', 'plazoDias']) sortBy: CreditSortField = 'solicitadaEn';
  @IsOptional() @IsIn(['asc', 'desc']) sortDir: SortDirection = 'desc';
}

export class CreditEventQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['CREADA','ACTUALIZADA','ENVIADA_REVISION','REFERENCIA_AGREGADA','REFERENCIA_ACTUALIZADA','REFERENCIA_VERIFICADA','DOCUMENTO_AGREGADO','DOCUMENTO_VALIDADO','DOCUMENTO_RECHAZADO','REQUISITO_ACTUALIZADO','APROBADA','APROBADA_AJUSTADA','RECHAZADA','CANCELADA','CREDITO_CREADO','INTEGRACION_PEDIDO_APLICADA','INTEGRACION_PEDIDO_FALLIDA','OBSERVACION']) tipo?: CreditEventType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usuarioId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class CreditSummaryQueryDto {
  @IsOptional() @IsIn(['PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'CANCELADA']) estado?: CreditApplicationState;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) solicitanteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vendedorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) politicaId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class CreditPolicyRequirementDto {
  @Transform(trim) @IsString() @Length(1, 60) codigo: string;
  @Transform(trim) @IsString() @Length(2, 160) nombre: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) descripcion?: string | null;
  @IsOptional() @IsBoolean() obligatorio?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class CreateCreditPolicyDto {
  @Transform(trim) @IsString() @Length(2, 160) nombre: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) descripcion?: string | null;
  @IsOptional() @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) montoMaximo?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) plazoMaximoDias?: number | null;
  @IsOptional() @Transform(money) @Matches(/^\d{1,3}(?:\.\d{1,2})?$/) porcentajeAnticipo?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CreditPolicyRequirementDto) requisitos?: CreditPolicyRequirementDto[];
}

export class UpdateCreditPolicyDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 160) nombre?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) descripcion?: string | null;
  @IsOptional() @Transform(money) @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) montoMaximo?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) plazoMaximoDias?: number | null;
  @IsOptional() @Transform(money) @Matches(/^\d{1,3}(?:\.\d{1,2})?$/) porcentajeAnticipo?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CreditPolicyRequirementDto) requisitos?: CreditPolicyRequirementDto[];
}

export class CreditPolicyStatusDto {
  @Transform(bool) @IsBoolean() activo: boolean;
  @IsOptional() @Transform(trim) @IsString() @Length(3, 500) motivo?: string | null;
}

export class CreditPolicyListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Transform(bool) @IsBoolean() activo?: boolean;
}

export class CreditPortfolioQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(['ACTIVO', 'CERRADO']) estado?: 'ACTIVO' | 'CERRADO';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vendedorId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
  @IsOptional() @Transform(bool) @IsBoolean() conSaldoPendiente?: boolean;
}
