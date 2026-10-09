import { Rol } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUserDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(120)
  nombre: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(250)
  correo: string;

  @IsString() @MinLength(8) @MaxLength(128)
  contrasena: string;

  @IsEnum(Rol)
  rol: Rol;

  /** Compatibilidad con el formulario existente; la empresa se obtiene del JWT/BD. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  empresaId?: number;
}
