import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Solo el nombre es obligatorio. El id lo asigna Prisma.
 * Los otros campos son opcionales y admiten null para poder vaciarlos
 * mediante PATCH sin enviar valores inventados.
 */
export class CreateProviderDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsEmail()
  correo?: string | null;

  @IsOptional()
  @IsString()
  telefono?: string | null;

  @IsOptional()
  @IsString()
  direccion?: string | null;

  @IsOptional()
  @IsString()
  razonSocial?: string | null;

  @IsOptional()
  @IsString()
  rfc?: string | null;

  @IsOptional()
  @IsString()
  nombreContacto?: string | null;

  @IsOptional()
  @IsString()
  telefonoContacto?: string | null;

  @IsOptional()
  @IsEmail()
  emailContacto?: string | null;

  @IsOptional()
  @IsString()
  pais?: string | null;

  @IsOptional()
  @IsString()
  ciudad?: string | null;

  @IsOptional()
  @IsString()
  codigoPostal?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  notas?: string | null;
}
