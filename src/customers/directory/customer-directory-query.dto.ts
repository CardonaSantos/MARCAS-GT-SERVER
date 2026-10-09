import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const CUSTOMER_SORT_FIELDS = [
  'nombre', 'apellido', 'tipoCliente', 'correo', 'telefono', 'creadoEn', 'actualizadoEn',
] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CustomerDirectoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(150)
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  departamentoId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  municipioId?: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  tipoCliente?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  volumenCompra?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  presupuestoMensual?: string;

  /** Intereses separados por coma. Coincide si el cliente tiene al menos uno. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(700)
  intereses?: string;

  @IsOptional() @IsIn(CUSTOMER_SORT_FIELDS)
  sortBy: CustomerSortField = 'nombre';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'asc';
}
