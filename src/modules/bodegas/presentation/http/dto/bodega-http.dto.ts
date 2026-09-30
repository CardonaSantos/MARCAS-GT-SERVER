import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  BodegaSortField,
  SortDirection,
} from '../../../application/models/bodega.models';

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1' || value === 1)
    return true;
  if (value === false || value === 'false' || value === '0' || value === 0)
    return false;
  return value;
};

const optionalTrimmedString = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return value;
  return String(value).trim();
};

export class CreateBodegaDto {
  @Transform(optionalTrimmedString)
  @IsString()
  @Length(2, 30)
  codigo: string;

  @Transform(optionalTrimmedString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(250)
  direccion?: string | null;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(40)
  telefono?: string | null;

  @IsOptional()
  @IsBoolean()
  esPrincipal?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsableId?: number | null;
}

export class UpdateBodegaDto {
  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @Length(2, 30)
  codigo?: string;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(250)
  direccion?: string | null;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(40)
  telefono?: string | null;
}

export class AssignBodegaResponsibleDto {
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsableId: number | null;
}

export class DeactivateBodegaDto {
  @Transform(optionalTrimmedString)
  @IsString()
  @Length(3, 300)
  motivo: string;
}

export class ListBodegasQueryDto {
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
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  esPrincipal?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsableId?: number;

  @IsOptional()
  @IsIn(['codigo', 'nombre', 'creadoEn', 'actualizadoEn'])
  sortBy: BodegaSortField = 'nombre';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: SortDirection = 'asc';
}

export class BodegaSelectQueryDto {
  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class BodegaEventsQueryDto {
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
