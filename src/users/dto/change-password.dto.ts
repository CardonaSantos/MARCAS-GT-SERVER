import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  /** Nunca confiar en adminId recibido del cliente: el actor se toma del JWT. */
  @IsString() @IsNotEmpty()
  adminPassword: string;

  @IsString() @MinLength(8) @MaxLength(128)
  newPassword: string;
}
