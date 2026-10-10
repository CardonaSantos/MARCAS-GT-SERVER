import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RegistrarAccionDto {
  @IsIn(['IMPRESION_SOLICITADA', 'DESCARGA_SOLICITADA', 'COMPARTICION_PREPARADA'])
  accion: 'IMPRESION_SOLICITADA' | 'DESCARGA_SOLICITADA' | 'COMPARTICION_PREPARADA';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  canal?: string;

  @IsString()
  @Length(8, 128)
  claveIdempotencia: string;
}
