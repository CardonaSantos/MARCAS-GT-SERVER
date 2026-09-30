import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SortDirection } from 'src/shared/application/pagination/page.models';
import { OrderSortField } from '../../../application/models/order.models';
import {
  OrderEventType,
  OrderPaymentCondition,
  OrderPaymentState,
  OrderState,
} from '../../../order.types';

const trimmed = ({ value }: { value: unknown }) =>
  value === undefined || value === null ? value : String(value).trim();

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return value;
};

const moneyString = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === '' ? value : String(value).trim();

export class OrderLineInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidadSolicitada: number;

  @IsOptional()
  @Transform(moneyString)
  @Matches(/^\d{1,10}(?:\.\d{1,2})?$/)
  descuento?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;
}

export class CreateOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendedorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  visitaId?: number | null;

  @IsIn(['PREPAGO', 'CONTRAENTREGA', 'CREDITO', 'MIXTO'])
  condicionPago: OrderPaymentCondition;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  detalles?: OrderLineInputDto[];
}

export class UpdateOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vendedorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  visitaId?: number | null;

  @IsOptional()
  @IsIn(['PREPAGO', 'CONTRAENTREGA', 'CREDITO', 'MIXTO'])
  condicionPago?: OrderPaymentCondition;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  detalles?: OrderLineInputDto[];
}

export class OrderReasonDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 500)
  motivo: string;
}

export class OrderListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(120) search?: string;

  @IsOptional()
  @IsIn(['BORRADOR','PENDIENTE_VALIDACION','CONFIRMADO','EN_PREPARACION','PARCIALMENTE_DESPACHADO','DESPACHADO','PARCIALMENTE_ENTREGADO','ENTREGADO','CANCELADO'])
  estado?: OrderState;

  @IsOptional()
  @IsIn(['PENDIENTE','PARCIAL','PAGADO','REEMBOLSADO','ANULADO'])
  estadoPago?: OrderPaymentState;

  @IsOptional()
  @IsIn(['PREPAGO','CONTRAENTREGA','CREDITO','MIXTO'])
  condicionPago?: OrderPaymentCondition;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vendedorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) visitaId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
  @IsOptional() @Transform(optionalBoolean) @IsBoolean() soloAbiertos?: boolean;

  @IsOptional()
  @IsIn(['creadoEn','actualizadoEn','numero','estado','estadoPago','cliente','vendedor','total'])
  sortBy: OrderSortField = 'creadoEn';

  @IsOptional() @IsIn(['asc','desc']) sortDir: SortDirection = 'desc';
}

export class OrderEventQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;

  @IsOptional()
  @IsIn(['CREADO','ACTUALIZADO','VALIDACION_SOLICITADA','CONFIRMADO','RESERVA_CREADA','RESERVA_LIBERADA','PREPARACION_INICIADA','DESPACHO_PARCIAL','DESPACHADO','ENTREGA_PARCIAL','ENTREGADO','CANCELADO','OBSERVACION'])
  tipo?: OrderEventType;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usuarioId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}

export class OrderSummaryQueryDto {
  @IsOptional()
  @IsIn(['BORRADOR','PENDIENTE_VALIDACION','CONFIRMADO','EN_PREPARACION','PARCIALMENTE_DESPACHADO','DESPACHADO','PARCIALMENTE_ENTREGADO','ENTREGADO','CANCELADO'])
  estado?: OrderState;

  @IsOptional()
  @IsIn(['PENDIENTE','PARCIAL','PAGADO','REEMBOLSADO','ANULADO'])
  estadoPago?: OrderPaymentState;

  @IsOptional()
  @IsIn(['PREPAGO','CONTRAENTREGA','CREDITO','MIXTO'])
  condicionPago?: OrderPaymentCondition;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clienteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vendedorId?: number;
  @IsOptional() @Type(() => Date) @IsDate() fechaDesde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() fechaHasta?: Date;
}
