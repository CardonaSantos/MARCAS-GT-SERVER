import { MetodoPago } from '@prisma/client';
import { IsEnum, IsInt, IsString } from 'class-validator';

export class createPaymentDto {
  @IsInt()
  creditoID: number;

  @IsInt()
  monto: number;

  @IsInt()
  empresaId: number;

  @IsInt()
  creditoId: number;

  @IsInt()
  cuotaId: number; // ✅ NUEVO

  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;

  @IsString()
  password: string;

  @IsInt()
  userId: number;

  @IsInt()
  ventaId: number;
}
