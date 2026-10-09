import { Rol } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const USER_SORT_FIELDS = ['nombre', 'correo', 'rol', 'activo', 'creadoEn', 'actualizadoEn'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export class UserDirectoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(150)
  search?: string;

  @IsOptional() @IsEnum(Rol)
  rol?: Rol;

  @IsOptional() @IsIn(['true', 'false'])
  activo?: 'true' | 'false';

  @IsOptional() @IsIn(USER_SORT_FIELDS)
  sortBy: UserSortField = 'nombre';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'asc';
}
