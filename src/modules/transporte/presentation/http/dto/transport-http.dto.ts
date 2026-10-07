import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
const trimmed = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim();
const ob = ({ value }: { value: unknown }) =>
  value === '' || value == null
    ? undefined
    : [true, 'true', '1', 1].includes(value as any)
      ? true
      : [false, 'false', '0', 0].includes(value as any)
        ? false
        : value;
export class LoadInputDto {
  @Type(() => Number) @IsInt() @Min(1) ordenDespachoDetalleId: number;
  @Type(() => Number) @IsInt() @Min(1) cantidadPlanificada: number;
}
export class StopInputDto {
  @Type(() => Number) @IsInt() @Min(1) ordenDespachoId: number;
  @Type(() => Number) @IsInt() @Min(1) secuencia: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LoadInputDto)
  cargas: LoadInputDto[];
}
export class CreateShipmentDto {
  @Type(() => Number) @IsInt() @Min(1) bodegaId: number;
  @IsIn(['INTERNO', 'EXTERNO']) modalidad: any;
  @IsOptional() @Type(() => Date) @IsDate() salidaProgramadaEn?: Date;
  @IsOptional() @Type(() => Date) @IsDate() entregaEstimadaEn?: Date;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(120) guia?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costo?: number;
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  comprobanteUrl?: string;
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StopInputDto)
  paradas: StopInputDto[];
}
export class AssignShipmentDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) transportistaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vehiculoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) conductorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) responsableId?: number;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}
export class LoadLineDto {
  @Type(() => Number) @IsInt() @Min(1) cargaDetalleId: number;
  @Type(() => Number) @IsInt() @Min(1) cantidadCargada: number;
}
export class ConfirmLoadDto {
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LoadLineDto)
  lineas: LoadLineDto[];
}
export class RouteDto {
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud?: number;
}
export class CancelDto {
  @Transform(trimmed) @IsString() @Length(3, 500) motivo: string;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}
export class ObservationDto {
  @Transform(trimmed) @IsString() @Length(2, 1000) detalle: string;
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(8, 200)
  claveIdempotencia?: string;
}
export class IncidentDto {
  @IsIn([
    'AVERIA',
    'ACCIDENTE',
    'TRAFICO',
    'BLOQUEO_RUTA',
    'SEGURIDAD',
    'DOCUMENTACION',
    'CLIENTE_NO_DISPONIBLE',
    'DIRECCION_INCORRECTA',
    'MERCADERIA',
    'OTRO',
  ])
  tipo: any;
  @IsIn(['BAJA', 'MEDIA', 'ALTA', 'CRITICA']) severidad: any;
  @Transform(trimmed) @IsString() @Length(3, 1500) descripcion: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud?: number;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}
export class ResolveIncidentDto {
  @Transform(trimmed) @IsString() @Length(3, 1500) resolucion: string;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}
export class ListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() search?: string;
  @IsOptional()
  @IsIn([
    'PROGRAMADO',
    'ASIGNADO',
    'CARGADO',
    'EN_RUTA',
    'ENTREGADO_PARCIAL',
    'COMPLETADO',
    'INCIDENCIA',
    'CANCELADO',
  ])
  estado?: any;
  @IsOptional() @IsIn(['INTERNO', 'EXTERNO']) modalidad?: any;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) transportistaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vehiculoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) conductorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) responsableId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Transform(ob) @IsBoolean() conIncidencia?: boolean;
  @IsOptional() @Transform(ob) @IsBoolean() soloAtrasados?: boolean;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
  @IsOptional()
  @IsIn(['creadoEn', 'numero', 'estado', 'salidaProgramadaEn', 'salidaEn'])
  sortBy: any = 'creadoEn';
  @IsOptional() @IsIn(['asc', 'desc']) sortDir: any = 'desc';
}
export class CandidateDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
}
export class RangeDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) bodegaId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}
export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class IncidentListDto extends PageDto {
  @IsOptional() @IsIn(['ABIERTA', 'EN_ATENCION', 'RESUELTA']) estado?: any;
}
