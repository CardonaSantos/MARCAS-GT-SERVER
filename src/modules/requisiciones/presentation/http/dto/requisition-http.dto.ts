import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
import { RequisitionSortField } from '../../../application/models/requisition.models';
import { RequisitionReceiptState, RequisitionState } from '../../../domain/requisition.types';

const trimmed = ({ value }: { value: unknown }) =>
  value === undefined || value === null ? value : String(value).trim();
const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return value;
};
const COST_PATTERN = /^\d+(?:\.\d{1,4})?$/;

export class RequisitionDetailInputDto {
  @Type(() => Number) @IsInt() @Min(1) productoId: number;
  @Type(() => Number) @IsInt() @Min(1) cantidadSolicitada: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Matches(COST_PATTERN)
  costoUnitarioEstimado?: string | null;
}

export class CreateRequisitionDto {
  @Type(() => Number) @IsInt() @Min(1) bodegaDestinoId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  proveedorId?: number | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RequisitionDetailInputDto)
  detalles?: RequisitionDetailInputDto[];
}

export class UpdateRequisitionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaDestinoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  proveedorId?: number | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RequisitionDetailInputDto)
  detalles?: RequisitionDetailInputDto[];
}

export class RequisitionReasonDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 500)
  motivo: string;
}

export class ReceiptDetailInputDto {
  @Type(() => Number) @IsInt() @Min(1) requisicionDetalleId: number;
  @Type(() => Number) @IsInt() @Min(1) cantidad: number;
  @Transform(trimmed) @IsString() @Matches(COST_PATTERN) costoUnitario: string;
}

export class RegisterRequisitionReceiptDto {
  @Transform(trimmed)
  @IsString()
  @Length(8, 160)
  claveIdempotencia: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  documentoReferencia?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recibidoEn?: Date | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReceiptDetailInputDto)
  detalles: ReceiptDetailInputDto[];
}

export class RequisitionListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(120) search?: string;

  @IsOptional()
  @IsIn(['BORRADOR', 'SOLICITADA', 'APROBADA', 'RECHAZADA', 'PARCIAL', 'COMPLETADA', 'CANCELADA'])
  estado?: RequisitionState;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaDestinoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) proveedorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) solicitanteId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  soloPendientesRecepcion?: boolean;

  @IsOptional()
  @IsIn(['creadoEn', 'actualizadoEn', 'estado', 'bodega', 'proveedor', 'solicitante'])
  sortBy: RequisitionSortField = 'creadoEn';

  @IsOptional() @IsIn(['asc', 'desc']) sortDir: SortDirection = 'desc';
}

export class RequisitionEventQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class ReceiptListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) requisicionId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaDestinoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) proveedorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) recibidoPorId?: number;

  @IsOptional()
  @IsIn(['PENDIENTE', 'APLICADA', 'FALLIDA'])
  estado?: RequisitionReceiptState;

  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class RequisitionSummaryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaDestinoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) proveedorId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}
