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
import {
  TransferSortField,
} from '../../../application/models/transfer.models';
import {
  TransferOperationState,
  TransferOperationType,
  TransferState,
} from '../../../transfer.types';

const trimmed = ({ value }: { value: unknown }) =>
  value === undefined || value === null
    ? value
    : String(value).trim();

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 0) {
    return false;
  }
  return value;
};

export class TransferDetailInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidadSolicitada: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;
}

export class CreateTransferDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaOrigenId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaDestinoId: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferDetailInputDto)
  detalles?: TransferDetailInputDto[];
}

export class UpdateTransferDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaOrigenId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaDestinoId?: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferDetailInputDto)
  detalles?: TransferDetailInputDto[];
}

export class TransferReasonDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 500)
  motivo: string;
}

export class TransferOperationBaseDto {
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
  ocurridaEn?: Date | null;
}

export class RegisterTransferOutboundDto extends TransferOperationBaseDto {}

export class TransferReceiptLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  transferenciaDetalleId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;
}

export class RegisterTransferReceiptDto extends TransferOperationBaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferReceiptLineDto)
  detalles: TransferReceiptLineDto[];
}

export class TransferListQueryDto {
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
    'BORRADOR',
    'PREPARADA',
    'EN_TRANSITO',
    'RECIBIDA_PARCIAL',
    'RECIBIDA',
    'CANCELADA',
  ])
  estado?: TransferState;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaOrigenId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaDestinoId?: number;

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

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  soloPendientes?: boolean;

  @IsOptional()
  @IsIn([
    'creadoEn',
    'actualizadoEn',
    'estado',
    'bodegaOrigen',
    'bodegaDestino',
    'creadoPor',
  ])
  sortBy: TransferSortField = 'creadoEn';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: SortDirection = 'desc';
}

export class TransferEventQueryDto {
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

export class TransferOperationListQueryDto {
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
  transferenciaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaOrigenId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaDestinoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usuarioId?: number;

  @IsOptional()
  @IsIn(['SALIDA', 'RECEPCION'])
  tipo?: TransferOperationType;

  @IsOptional()
  @IsIn(['PENDIENTE', 'APLICADA', 'FALLIDA'])
  estado?: TransferOperationState;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;
}

export class TransferSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaOrigenId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bodegaDestinoId?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;
}
