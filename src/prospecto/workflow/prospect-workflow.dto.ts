import {
  ArrayMaxSize, IsArray, IsEmail, IsEnum, IsInt, IsNumber, Max, Min,
  IsOptional, IsString, MaxLength,
} from 'class-validator';
import { TipoCliente } from '@prisma/client';

export class ProspectWorkflowStartDto {
  @IsOptional() @IsString() @MaxLength(150)
  nombreCompleto?: string;
  @IsOptional() @IsString() @MaxLength(150)
  apellido?: string;
  @IsOptional() @IsString() @MaxLength(200)
  empresaTienda?: string;
  @IsOptional() @IsString() @MaxLength(50)
  telefono?: string;
  @IsOptional() @IsEmail() @MaxLength(250)
  correo?: string;
  @IsOptional() @IsString() @MaxLength(350)
  direccion?: string;
  @IsInt() @Min(1)
  departamentoId: number;
  @IsInt() @Min(1)
  municipioId: number;
}
export class ProspectWorkflowFinishDto {
  @IsOptional() @IsString() @MaxLength(150)
  nombreCompleto?: string;
  @IsOptional() @IsString() @MaxLength(150)
  apellido?: string;
  @IsOptional() @IsString() @MaxLength(200)
  empresaTienda?: string;
  @IsOptional() @IsString() @MaxLength(50)
  telefono?: string;
  @IsOptional() @IsEmail() @MaxLength(250)
  correo?: string;
  @IsOptional() @IsString() @MaxLength(350)
  direccion?: string;
  @IsOptional() @IsInt() @Min(1)
  departamentoId?: number;
  @IsOptional() @IsInt() @Min(1)
  municipioId?: number;
  @IsOptional() @IsEnum(TipoCliente)
  tipoCliente?: TipoCliente;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true })
  categoriasInteres?: string[];
  @IsOptional() @IsString() @MaxLength(80)
  volumenCompra?: string;
  @IsOptional() @IsString() @MaxLength(80)
  presupuestoMensual?: string;
  @IsOptional() @IsString() @MaxLength(80)
  preferenciaContacto?: string;
  @IsOptional() @IsString() @MaxLength(2000)
  comentarios?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  latitud?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  longitud?: number;
}
export class ProspectWorkflowCancelDto {
  @IsString() @MaxLength(2000)
  motivo: string;
}
