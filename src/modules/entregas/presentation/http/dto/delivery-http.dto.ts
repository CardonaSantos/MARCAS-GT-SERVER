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
const bool = ({ value }: { value: unknown }) =>
  value === '' || value == null
    ? undefined
    : [true, 'true', '1', 1].includes(value as any)
      ? true
      : [false, 'false', '0', 0].includes(value as any)
        ? false
        : value;

export class CreateDeliveryDto {
  @Type(() => Number) @IsInt() @Min(1) envioDespachoId: number;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}

export class StartDeliveryDto {
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitud?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitud?: number;
}

export class DeliveryLineResultDto {
  @Type(() => Number) @IsInt() @Min(1) detalleId: number;
  @Type(() => Number) @IsInt() @Min(0) cantidadEntregada: number;
  @Type(() => Number) @IsInt() @Min(0) cantidadRechazada: number;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(500) motivoRechazo?: string;
}

export class UpdateDeliveryResultDto {
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(160) receptorNombre?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(80) receptorDocumento?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitud?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitud?: number;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(1500) observaciones?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => DeliveryLineResultDto)
  detalles: DeliveryLineResultDto[];
}

export class AddDeliveryEvidenceDto {
  @IsIn(['FIRMA','FOTO','DOCUMENTO','OTRO']) tipo: any;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() contenido?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(300) key?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(120) mimeType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) size?: number;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(1000) descripcion?: string;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}

export class FinalizeDeliveryDto {
  @IsIn(['ENTREGADA','PARCIAL','RECHAZADA','NO_ENTREGADA']) resultado: any;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(160) receptorNombre?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(80) receptorDocumento?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitud?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitud?: number;
  @IsOptional() @IsIn([
    'CLIENTE_AUSENTE','DIRECCION_INCORRECTA','LOCAL_CERRADO','REPROGRAMADA',
    'RECHAZO_CLIENTE','PROBLEMA_ACCESO','DOCUMENTACION','MERCADERIA_DANADA','OTRO',
  ]) motivoNoEntrega?: any;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(1000) detalleNoEntrega?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(1500) observaciones?: string;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}

export class DeliveryObservationDto {
  @Transform(trimmed) @IsString() @Length(2, 1000) detalle: string;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}

export class DeliveryListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() search?: string;
  @IsOptional() @IsIn(['PENDIENTE','EN_RUTA','PARCIAL','ENTREGADA','RECHAZADA','NO_ENTREGADA','CANCELADA']) estado?: any;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pedidoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) ordenDespachoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) envioDespachoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) registradoPorId?: number;
  @IsOptional() @IsIn([
    'CLIENTE_AUSENTE','DIRECCION_INCORRECTA','LOCAL_CERRADO','REPROGRAMADA',
    'RECHAZO_CLIENTE','PROBLEMA_ACCESO','DOCUMENTACION','MERCADERIA_DANADA','OTRO',
  ]) motivoNoEntrega?: any;
  @IsOptional() @Transform(bool) @IsBoolean() soloPendientes?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() soloSinFactura?: boolean;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
  @IsOptional() @IsIn(['creadoEn','actualizadoEn','estado','iniciadaEn','finalizadaEn']) sortBy: any = 'creadoEn';
  @IsOptional() @IsIn(['asc','desc']) sortDir: any = 'desc';
}

export class DeliveryCandidateDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
}

export class DeliveryRangeDto {
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class DeliveryEventQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() tipo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usuarioId?: number;
}
