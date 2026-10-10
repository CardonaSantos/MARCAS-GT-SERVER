import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim();

const money = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === ''
    ? value
    : String(value).trim();

export class CreditPaymentPlanInstallmentDto {
  @Type(() => Date)
  @IsDate()
  fechaVencimiento: Date;

  @Transform(money)
  @Matches(/^\d{1,10}(?:\.\d{1,2})?$/)
  montoProgramado: string;
}

export class CreateCreditPaymentPlanDto {
  @IsIn(['SEMANAL', 'QUINCENAL', 'MENSUAL', 'PERSONALIZADA'])
  frecuencia: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'PERSONALIZADA';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => CreditPaymentPlanInstallmentDto)
  cuotas: CreditPaymentPlanInstallmentDto[];

  @Transform(trim)
  @IsString()
  @Length(8, 120)
  claveIdempotencia: string;
}

export class UpdateCreditPaymentPlanDto extends CreateCreditPaymentPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class ActivateCreditPaymentPlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @Transform(trim)
  @IsString()
  @Length(8, 120)
  claveIdempotencia: string;
}
