import { Rol } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(250)
  correo?: string;

  @IsOptional() @IsEnum(Rol)
  rol?: Rol;

  @IsOptional() @IsBoolean()
  activo?: boolean;
}
