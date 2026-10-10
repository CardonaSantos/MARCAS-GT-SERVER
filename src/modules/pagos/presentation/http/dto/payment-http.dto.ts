import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim();

const upper = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim().toUpperCase();

const bool = ({ value }: { value: unknown }) =>
  value === '' || value == null
    ? undefined
    : [true, 'true', '1', 1].includes(value as never)
      ? true
      : [false, 'false', '0', 0].includes(value as never)
        ? false
        : value;

export class RegisterPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pedidoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bancoId?: number;

  @IsOptional()
  @IsIn(['ANTICIPO', 'CUOTA'])
  concepto?: 'ANTICIPO' | 'CUOTA';

  @IsIn([
    'EFECTIVO',
    'TARJETA',
    'TRANSFERENCIA_BANCO',
    'DEPOSITO',
    'CHEQUE',
    'OTRO',
  ])
  metodo:
    | 'EFECTIVO'
    | 'TARJETA'
    | 'TRANSFERENCIA_BANCO'
    | 'DEPOSITO'
    | 'CHEQUE'
    | 'OTRO';

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3,8}$/)
  moneda = 'GTQ';

  @Transform(trimmed)
  @Matches(/^\d+(\.\d{1,2})?$/)
  monto: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  referencia?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaPago?: Date;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @Transform(trimmed)
  @IsString()
  @Length(8, 200)
  claveIdempotencia: string;
}

export class PaymentActionDto {
  @Transform(trimmed)
  @IsString()
  @Length(8, 200)
  claveIdempotencia: string;
}

export class PaymentReasonActionDto extends PaymentActionDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 1000)
  motivo: string;
}

export class AddPaymentProofDto {
  @Transform(trimmed)
  @IsString()
  @Length(1, 2000)
  url: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  key?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @Transform(trimmed)
  @IsString()
  @Length(8, 200)
  claveIdempotencia: string;
}

export class ApplyPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cuentaPorCobrarId: number;

  @Transform(trimmed)
  @Matches(/^\d+(\.\d{1,2})?$/)
  monto: string;

  @Transform(trimmed)
  @IsString()
  @Length(8, 200)
  claveIdempotencia: string;
}

export class PaymentListDto {
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
  search?: string;

  @IsOptional()
  @IsIn(['PENDIENTE', 'VERIFICADO', 'RECHAZADO', 'ANULADO'])
  estado?: string;

  @IsOptional()
  @IsIn([
    'EFECTIVO',
    'TARJETA',
    'TRANSFERENCIA_BANCO',
    'DEPOSITO',
    'CHEQUE',
    'OTRO',
  ])
  metodo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pedidoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bancoId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;

  @IsOptional()
  @Transform(bool)
  @IsBoolean()
  soloConSaldoDisponible?: boolean;
}

export class PaymentRangeDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;
}

export class PaymentPageDto {
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
}


export class CreatePaymentBankDto {
  @Transform(trimmed)
  @IsString()
  @Length(2, 160)
  nombre: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(80)
  codigo?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  cuenta?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdatePaymentBankDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(2, 160)
  nombre?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(80)
  codigo?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  cuenta?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
