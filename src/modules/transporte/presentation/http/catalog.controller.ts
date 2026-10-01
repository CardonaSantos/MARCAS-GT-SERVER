import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import {
  CreateCarrierUseCase,
  CreateDriverUseCase,
  CreateVehicleUseCase,
  DeactivateTransportResourceUseCase,
  ListTransportCatalogUseCase,
} from '../../application/use-cases/catalog.use-cases';
import { TransportExceptionFilter } from './transport-exception.filter';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
class Q {
  @IsOptional() @IsString() search?: string;
  @IsOptional() activo?: boolean;
  @IsOptional() @IsIn(['INTERNO', 'EXTERNO']) tipo?: any;
  @IsOptional() estado?: any;
}
class CarrierDto {
  @IsOptional() @IsString() codigo?: string;
  @IsIn(['INTERNO', 'EXTERNO']) tipo: any;
  @IsString() @Length(2, 150) nombre: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() correo?: string;
}
class VehicleDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) transportistaId?: number;
  @IsString() @Length(2, 30) placa: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsString() modelo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) capacidadKg?: number;
}
class DriverDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) transportistaId?: number;
  @IsString() @Length(2, 150) nombre: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() licencia?: string;
}
class D {
  @IsString() @Length(3, 500) motivo: string;
}
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(TransportExceptionFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
class Base {}
@Controller('transportistas')
export class CarrierController extends Base {
  constructor(
    private readonly createUse: CreateCarrierUseCase,
    private readonly listUse: ListTransportCatalogUseCase,
    private readonly deactivate: DeactivateTransportResourceUseCase,
  ) {
    super();
  }
  @Get() @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD') list(
    @Query() q: Q,
    @CurrentActorId() a: number,
  ) {
    return this.listUse.carriers(q, a);
  }
  @Post() @Roles('ADMIN', 'BODEGA') create(
    @Body() d: CarrierDto,
    @CurrentActorId() a: number,
  ) {
    return this.createUse.execute(d, a);
  }
  @Post(':id/desactivar') @Roles('ADMIN', 'BODEGA') disable(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: D,
    @CurrentActorId() a: number,
  ) {
    return this.deactivate.carrier(id, d.motivo, a);
  }
}
@Controller('vehiculos')
export class VehicleController extends Base {
  constructor(
    private readonly createUse: CreateVehicleUseCase,
    private readonly listUse: ListTransportCatalogUseCase,
    private readonly deactivate: DeactivateTransportResourceUseCase,
  ) {
    super();
  }
  @Get() @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD') list(
    @Query() q: Q,
    @CurrentActorId() a: number,
  ) {
    return this.listUse.vehicles(q, a);
  }
  @Post() @Roles('ADMIN', 'BODEGA') create(
    @Body() d: VehicleDto,
    @CurrentActorId() a: number,
  ) {
    return this.createUse.execute(d, a);
  }
  @Post(':id/desactivar') @Roles('ADMIN', 'BODEGA') disable(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: D,
    @CurrentActorId() a: number,
  ) {
    return this.deactivate.vehicle(id, d.motivo, a);
  }
}
@Controller('conductores')
export class DriverController extends Base {
  constructor(
    private readonly createUse: CreateDriverUseCase,
    private readonly listUse: ListTransportCatalogUseCase,
    private readonly deactivate: DeactivateTransportResourceUseCase,
  ) {
    super();
  }
  @Get() @Roles('ADMIN', 'BODEGA', 'CONTABILIDAD') list(
    @Query() q: Q,
    @CurrentActorId() a: number,
  ) {
    return this.listUse.drivers(q, a);
  }
  @Post() @Roles('ADMIN', 'BODEGA') create(
    @Body() d: DriverDto,
    @CurrentActorId() a: number,
  ) {
    return this.createUse.execute(d, a);
  }
  @Post(':id/desactivar') @Roles('ADMIN', 'BODEGA') disable(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: D,
    @CurrentActorId() a: number,
  ) {
    return this.deactivate.driver(id, d.motivo, a);
  }
}
