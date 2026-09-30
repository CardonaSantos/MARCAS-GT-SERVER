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
  ValidateIf,
} from 'class-validator';
import { SortDirection } from 'src/shared/application/pagination/page.models';
import { InventorySortField } from '../../../application/models/inventory.models';
import {
  InventoryMovementType,
  InventoryReservationState,
} from '../../../domain/inventory.types';

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1' || value === 1)
    return true;
  if (value === false || value === 'false' || value === '0' || value === 0)
    return false;
  return value;
};

const trimmed = ({ value }: { value: unknown }) =>
  value === undefined || value === null ? value : String(value).trim();

const COST_PATTERN = /^\d+(?:\.\d{1,4})?$/;

export class InventoryListQueryDto {
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
  productoId?: number;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  conExistencia?: boolean;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  conReservas?: boolean;

  @IsOptional()
  @IsIn([
    'producto',
    'codigoProducto',
    'bodega',
    'cantidadReal',
    'cantidadReservada',
    'cantidadDisponible',
    'costoPromedio',
    'actualizadoEn',
  ])
  sortBy: InventorySortField = 'actualizadoEn';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: SortDirection = 'desc';
}

export class InventorySummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId?: number;
}

export class MovementQueryDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId?: number;

  @IsOptional()
  @IsIn([
    'MIGRACION_INICIAL',
    'ENTRADA_RECEPCION',
    'SALIDA_DESPACHO',
    'RESERVA',
    'LIBERACION_RESERVA',
    'AJUSTE_ENTRADA',
    'AJUSTE_SALIDA',
    'TRANSFERENCIA_SALIDA',
    'TRANSFERENCIA_ENTRADA',
    'DEVOLUCION',
  ])
  tipo?: InventoryMovementType;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(80)
  referenciaTipo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  referenciaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creadoPorId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;
}

export class ReservationQueryDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pedidoDetalleId?: number;

  @IsOptional()
  @IsIn([
    'ACTIVA',
    'PARCIAL',
    'APLICADA',
    'LIBERADA',
    'CANCELADA',
    'FINALIZADA_MIXTA',
  ])
  estado?: InventoryReservationState;
}

export class ReferenceDto {
  @ValidateIf((object) => object.referenciaId !== undefined)
  @Transform(trimmed)
  @IsString()
  @Length(2, 80)
  referenciaTipo?: string;

  @ValidateIf((object) => object.referenciaTipo !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  referenciaId?: number;
}

export class RegisterEntryDto extends ReferenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @Transform(trimmed)
  @IsString()
  @Matches(COST_PATTERN)
  costoUnitario: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  proveedorId?: number | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  claveIdempotencia?: string | null;
}

export class AdjustInventoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @IsIn(['ENTRADA', 'SALIDA'])
  tipo: 'ENTRADA' | 'SALIDA';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Matches(COST_PATTERN)
  costoUnitario?: string | null;

  @Transform(trimmed)
  @IsString()
  @Length(3, 500)
  motivo: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  claveIdempotencia?: string | null;
}

export class ReserveInventoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pedidoDetalleId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  claveIdempotencia?: string | null;
}

export class ReservationMutationDto extends ReferenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  claveIdempotencia?: string | null;
}

export class CancelReservationDto extends ReferenceDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 500)
  motivo: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  claveIdempotencia?: string | null;
}

export class RegisterReturnDto extends ReferenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Matches(COST_PATTERN)
  costoUnitario?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  claveIdempotencia?: string | null;
}
