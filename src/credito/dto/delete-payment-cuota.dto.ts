// delete-payment.dto.ts
import { IsInt, IsString } from 'class-validator';

export class DeletePaymentDto {
  @IsInt() userId: number;
  @IsString() password: string;
  @IsInt() empresaId: number;
  @IsInt() creditoId: number; // ID del crédito
  @IsInt() cuotaId: number; // ID de la cuota específica
}
