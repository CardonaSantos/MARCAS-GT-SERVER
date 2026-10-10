import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEmail,
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

const trimmed = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim();
const bool = ({ value }: { value: unknown }) =>
  value === '' || value == null
    ? undefined
    : [true, 'true', '1', 1].includes(value as never)
      ? true
      : [false, 'false', '0', 0].includes(value as never)
        ? false
        : value;

export class InvoiceLineSelectionDto {
  @Type(() => Number) @IsInt() @Min(1) entregaDetalleId: number;
  @Type(() => Number) @IsInt() @Min(1) cantidad: number;
}

export class CreateInvoiceDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @IsInt({ each: true }) @Min(1, { each: true }) @Type(() => Number)
  entregaIds: number[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => InvoiceLineSelectionDto)
  lineas: InvoiceLineSelectionDto[];

  @Transform(trimmed) @IsString() @Length(8, 200)
  claveIdempotencia: string;
}

export class DiscardInvoiceDto {
  @Transform(trimmed) @IsString() @Length(3, 1000) motivo: string;
  @Transform(trimmed) @IsString() @Length(8, 200) claveIdempotencia: string;
}

export class PrepareInvoiceDto {
  @Transform(trimmed) @IsString() @Length(2, 8) tipoDte = 'FACT';
  @IsIn(['PRUEBAS', 'PRODUCCION']) entorno: 'PRUEBAS' | 'PRODUCCION' = 'PRUEBAS';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) establecimientoId?: number;
  @IsOptional() @Transform(trimmed) @IsString() @Length(1, 40) serieInterna?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(30) versionEsquema?: string;
}

export class InvoiceListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() search?: string;
  @IsOptional() @IsIn(['BORRADOR', 'LISTA_EMISION', 'EMITIDA', 'DESCARTADA', 'ANULADA']) estado?: any;
  @IsOptional() @IsIn(['BORRADOR','PREPARADO','EN_PROCESO','CERTIFICACION_INCIERTA','CERTIFICADO','RECHAZADO','CONTINGENCIA','ANULACION_PENDIENTE','ANULADO']) estadoFiscal?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pedidoId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vendedorId?: number;
  @IsOptional() @IsIn(['PREPAGO','CONTRAENTREGA','CREDITO','MIXTO']) condicionPago?: string;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
  @IsOptional() @Transform(bool) @IsBoolean() soloPendientesFel?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() soloErroresFel?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() soloInciertas?: boolean;
  @IsOptional() @IsIn(['creadoEn','actualizadoEn','estado','total','emitidaEn']) sortBy: any = 'creadoEn';
  @IsOptional() @IsIn(['asc','desc']) sortDir: any = 'desc';
}

export class BillingCandidateDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pedidoId?: number;
}

export class BillingRangeDto {
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class ReceivableListDto extends PageDto {
  @IsOptional() @Transform(trimmed) @IsString() search?: string;
  @IsOptional() @IsIn(['PENDIENTE','PARCIAL','PAGADA','VENCIDA','ANULADA']) estado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Transform(bool) @IsBoolean() soloVencidas?: boolean;
}

export class CompanyFiscalProfileDto {
  @Type(() => Number) @IsInt() @Min(1) empresaId: number;
  @Transform(trimmed) @IsString() @Length(2, 16) nit: string;
  @Transform(trimmed) @IsString() @Length(2, 200) razonSocial: string;
  @Transform(trimmed) @IsString() @Length(1, 16) afiliacionIva: string;
  @IsOptional() @Transform(trimmed) @IsEmail() correoFiscal?: string;
  @Transform(trimmed) @IsString() @Length(2, 300) direccion: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(30) codigoPostal?: string;
  @Transform(trimmed) @IsString() @Length(2, 120) municipio: string;
  @Transform(trimmed) @IsString() @Length(2, 120) departamento: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 3) pais = 'GT';
  @IsBoolean() preciosIncluyenImpuestos = true;
  @IsOptional() @Transform(trimmed) @Matches(/^\d{1,3}(\.\d{1,4})?$/) tasaIvaDefault?: string;
}

export class EstablishmentFiscalDto {
  @Type(() => Number) @IsInt() @Min(1) empresaId: number;
  @Type(() => Number) @IsInt() @Min(0) codigoSat: number;
  @Transform(trimmed) @IsString() @Length(2, 200) nombreComercial: string;
  @IsOptional() @Transform(trimmed) @IsEmail() correo?: string;
  @Transform(trimmed) @IsString() @Length(2, 300) direccion: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(30) codigoPostal?: string;
  @Transform(trimmed) @IsString() @Length(2, 120) municipio: string;
  @Transform(trimmed) @IsString() @Length(2, 120) departamento: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 3) pais = 'GT';
  @IsOptional() @Transform(bool) @IsBoolean() esPrincipal?: boolean;
}

export class CustomerFiscalProfileDto {
  @IsIn(['NIT','CUI','CF','PASAPORTE','OTRO']) tipoIdentificacion: any;
  @Transform(trimmed) @IsString() @Length(1, 32) identificacion: string;
  @Transform(trimmed) @IsString() @Length(2, 200) nombreFiscal: string;
  @IsOptional() @Transform(trimmed) @IsEmail() correoFiscal?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(300) direccion?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(30) codigoPostal?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(120) municipio?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(120) departamento?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 3) pais = 'GT';
}

export class ProductFiscalProfileDto {
  @IsIn(['BIEN','SERVICIO']) bienOServicio: any;
  @Transform(trimmed) @IsString() @Length(1, 16) unidadMedida = 'UN';
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(1000) descripcionFiscal?: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(50) nombreCortoImpuesto?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) codigoUnidadGravable?: number;
  @IsOptional() @Transform(bool) @IsBoolean() activo?: boolean;
}
