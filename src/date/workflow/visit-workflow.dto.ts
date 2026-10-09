import { MotivoVisita, TipoVisita } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class VisitStartDto {
  @IsInt() @Min(1)
  clienteId: number;

  @IsEnum(MotivoVisita)
  motivoVisita: MotivoVisita;

  @IsEnum(TipoVisita)
  tipoVisita: TipoVisita;
}

export class VisitFinishDto {
  @IsString() @MaxLength(3000)
  observaciones: string;
}

export class VisitCancelDto {
  @IsString() @IsNotEmpty() @MaxLength(2000)
  motivoCancelacion: string;
}
