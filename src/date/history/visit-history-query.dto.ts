import { Transform, Type } from 'class-transformer';
import { EstadoVisita, MotivoVisita, TipoVisita } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export const VISIT_HISTORY_SORT_FIELDS = [
  'inicio', 'fin', 'creadoEn', 'actualizadoEn', 'estadoVisita', 'tipoVisita', 'motivoVisita',
] as const;
export type VisitHistorySort = (typeof VISIT_HISTORY_SORT_FIELDS)[number];

export class VisitHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(150)
  search?: string;

  @IsOptional() @IsEnum(EstadoVisita)
  estadoVisita?: EstadoVisita;

  @IsOptional() @IsEnum(TipoVisita)
  tipoVisita?: TipoVisita;

  @IsOptional() @IsEnum(MotivoVisita)
  motivoVisita?: MotivoVisita;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  clienteId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  vendedorId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  departamentoId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  municipioId?: number;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  desde?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true })
  hasta?: string;

  @IsOptional() @IsIn(VISIT_HISTORY_SORT_FIELDS)
  sortBy: VisitHistorySort = 'inicio';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';
}
