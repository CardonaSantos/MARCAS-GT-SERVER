import { Transform, Type } from 'class-transformer';
import { EstadoProspecto, TipoCliente } from '@prisma/client';
import {
  IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches,
  Max, MaxLength, Min,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const PROSPECT_HISTORY_SORT_FIELDS = [
  'creadoEn', 'actualizadoEn', 'inicio', 'fin', 'nombreCompleto',
  'empresaTienda', 'estado',
] as const;
export type ProspectHistorySortField = (typeof PROSPECT_HISTORY_SORT_FIELDS)[number];

export class ProspectHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(150)
  search?: string;

  @IsOptional() @IsEnum(EstadoProspecto)
  estado?: EstadoProspecto;

  @IsOptional() @IsEnum(TipoCliente)
  tipoCliente?: TipoCliente;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  departamentoId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  municipioId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  vendedorId?: number;

  @IsOptional() @IsIn(['true', 'false'])
  convertido?: 'true' | 'false';

  @IsOptional() @Matches(/^\\d{4}-\\d{2}-\\d{2}$/) @IsDateString({ strict: true })
  desde?: string;

  @IsOptional() @Matches(/^\\d{4}-\\d{2}-\\d{2}$/) @IsDateString({ strict: true })
  hasta?: string;

  @IsOptional() @IsIn(PROSPECT_HISTORY_SORT_FIELDS)
  sortBy: ProspectHistorySortField = 'creadoEn';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';
}
