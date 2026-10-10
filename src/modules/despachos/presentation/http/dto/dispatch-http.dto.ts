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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SortDirection } from 'src/shared/application/pagination/page.models';
import { DispatchSortField } from '../../../application/models/dispatch.models';
import {
  DispatchEventType,
  DispatchOperationState,
  DispatchOperationType,
  DispatchState,
} from '../../../dispatch.types';

const trimmed = ({ value }: { value: unknown }) =>
  value === undefined || value === null
    ? value
    : String(value).trim();

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 1
  ) {
    return true;
  }
  if (
    value === false ||
    value === 'false' ||
    value === '0' ||
    value === 0
  ) {
    return false;
  }
  return value;
};

export class DispatchLineInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pedidoDetalleId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidadProgramada: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;
}

export class CreateDispatchDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pedidoId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  programadoEn?: Date | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DispatchLineInputDto)
  detalles: DispatchLineInputDto[];
}

export class UpdateDispatchDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  programadoEn?: Date | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DispatchLineInputDto)
  detalles?: DispatchLineInputDto[];
}

export class DispatchOperationBaseDto {
  @Transform(trimmed)
  @IsString()
  @Length(8, 200)
  claveIdempotencia: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ocurridaEn?: Date | null;
}

export class StartDispatchPreparationDto extends DispatchOperationBaseDto {}

export class PreparationLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  detalleId: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  cantidadPreparada: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;
}

export class UpdateDispatchPreparationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PreparationLineDto)
  detalles: PreparationLineDto[];
}

export class DispatchOutputLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  detalleId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;
}

export class RegisterDispatchOutputDto extends DispatchOperationBaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DispatchOutputLineDto)
  detalles: DispatchOutputLineDto[];
}

export class CancelDispatchDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 500)
  motivo: string;

  @Transform(trimmed)
  @IsString()
  @Length(8, 200)
  claveIdempotencia: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ocurridaEn?: Date | null;
}

export class DispatchObservationDto {
  @Transform(trimmed)
  @IsString()
  @Length(2, 1000)
  detalle: string;
}

export class DispatchCandidateQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendedorId?: number;
}

export class DispatchListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn([
    'PENDIENTE',
    'PREPARANDO',
    'PREPARADA',
    'PARCIALMENTE_DESPACHADA',
    'DESPACHADA',
    'CANCELADA',
  ])
  estado?: DispatchState;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pedidoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vendedorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) creadoPorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) preparadoPorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) despachadoPorId?: number;

  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
  @IsOptional() @Type(() => Date) @IsDate() programadoDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() programadoHasta?: Date;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  soloPendientes?: boolean;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  soloAtrasados?: boolean;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  conPendientePreparacion?: boolean;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  conPendienteDespacho?: boolean;

  @IsOptional()
  @IsIn([
    'creadoEn',
    'actualizadoEn',
    'numero',
    'estado',
    'programadoEn',
    'pedido',
    'cliente',
    'bodega',
    'preparadoEn',
    'despachadoEn',
  ])
  sortBy: DispatchSortField = 'creadoEn';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: SortDirection = 'desc';
}

export class DispatchEventQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;

  @IsOptional()
  @IsIn([
    'CREADA',
    'ACTUALIZADA',
    'PREPARACION_INICIADA',
    'PREPARACION_AJUSTADA',
    'PREPARADA',
    'DESPACHO_PARCIAL',
    'DESPACHADA',
    'CANCELADA',
    'OPERACION_FALLIDA',
    'OPERACION_REINTENTADA',
    'OBSERVACION',
  ])
  tipo?: DispatchEventType;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usuarioId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class DispatchOperationListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dispatchId?: number;

  @IsOptional()
  @IsIn([
    'RESERVA_PREPARACION',
    'SALIDA_DESPACHO',
    'LIBERACION_RESERVA',
  ])
  tipo?: DispatchOperationType;

  @IsOptional()
  @IsIn(['PENDIENTE', 'APLICANDO', 'APLICADA', 'FALLIDA'])
  estado?: DispatchOperationState;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usuarioId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class DispatchOperationalReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;
}

export class DispatchSummaryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}
