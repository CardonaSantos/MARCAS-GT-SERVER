import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdjustInventoryUseCase } from '../../application/use-cases/adjust-inventory.use-case';
import { ApplyInventoryReservationUseCase } from '../../application/use-cases/apply-inventory-reservation.use-case';
import { CancelInventoryReservationUseCase } from '../../application/use-cases/cancel-inventory-reservation.use-case';
import { GetInventoryReservationUseCase } from '../../application/use-cases/get-inventory-reservation.use-case';
import { GetInventoryStockUseCase } from '../../application/use-cases/get-inventory-stock.use-case';
import { GetInventorySummaryUseCase } from '../../application/use-cases/get-inventory-summary.use-case';
import { GetProductAvailabilityUseCase } from '../../application/use-cases/get-product-availability.use-case';
import { ListInventoryMovementsUseCase } from '../../application/use-cases/list-inventory-movements.use-case';
import { ListInventoryReservationsUseCase } from '../../application/use-cases/list-inventory-reservations.use-case';
import { ListInventoryUseCase } from '../../application/use-cases/list-inventory.use-case';
import { RegisterInventoryEntryUseCase } from '../../application/use-cases/register-inventory-entry.use-case';
import { RegisterInventoryReturnUseCase } from '../../application/use-cases/register-inventory-return.use-case';
import { ReleaseInventoryReservationUseCase } from '../../application/use-cases/release-inventory-reservation.use-case';
import { ReserveInventoryUseCase } from '../../application/use-cases/reserve-inventory.use-case';
import {
  AdjustInventoryDto,
  CancelReservationDto,
  InventoryListQueryDto,
  InventorySummaryQueryDto,
  MovementQueryDto,
  RegisterEntryDto,
  RegisterReturnDto,
  ReservationMutationDto,
  ReservationQueryDto,
  ReserveInventoryDto,
} from './dto/inventory-http.dto';
import { InventoryExceptionFilter } from './inventory-exception.filter';
import { CurrentInventoryActorId } from './security/current-inventory-actor.decorator';
import {
  INVENTORY_AVAILABILITY_ROLES,
  INVENTORY_FULL_READ_ROLES,
  INVENTORY_MANAGEMENT_ROLES,
  InventoryRoles,
} from './security/inventory-roles.decorator';
import { InventoryRolesGuard } from './security/inventory-roles.guard';

@Controller('inventario')
@UseGuards(AuthGuard('jwt'), InventoryRolesGuard)
@UseFilters(InventoryExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class InventoryController {
  constructor(
    private readonly listInventory: ListInventoryUseCase,
    private readonly getStock: GetInventoryStockUseCase,
    private readonly getSummary: GetInventorySummaryUseCase,
    private readonly getAvailability: GetProductAvailabilityUseCase,
    private readonly listMovements: ListInventoryMovementsUseCase,
    private readonly listReservations: ListInventoryReservationsUseCase,
    private readonly getReservation: GetInventoryReservationUseCase,
    private readonly registerEntry: RegisterInventoryEntryUseCase,
    private readonly adjustInventory: AdjustInventoryUseCase,
    private readonly reserveInventory: ReserveInventoryUseCase,
    private readonly applyReservation: ApplyInventoryReservationUseCase,
    private readonly releaseReservation: ReleaseInventoryReservationUseCase,
    private readonly cancelReservation: CancelInventoryReservationUseCase,
    private readonly registerReturn: RegisterInventoryReturnUseCase,
  ) {}

  @Get()
  @InventoryRoles(...INVENTORY_FULL_READ_ROLES)
  list(@Query() query: InventoryListQueryDto) {
    return this.listInventory.execute(query);
  }

  @Get('resumen')
  @InventoryRoles(...INVENTORY_FULL_READ_ROLES)
  summary(@Query() query: InventorySummaryQueryDto) {
    return this.getSummary.execute(query.bodegaId);
  }

  @Get('productos/:productoId/disponibilidad')
  @InventoryRoles(...INVENTORY_AVAILABILITY_ROLES)
  availability(@Param('productoId', ParseIntPipe) productoId: number) {
    return this.getAvailability.execute(productoId);
  }

  @Get('movimientos')
  @InventoryRoles(...INVENTORY_FULL_READ_ROLES)
  movements(@Query() query: MovementQueryDto) {
    return this.listMovements.execute(query);
  }

  @Get('kardex/:productoId')
  @InventoryRoles(...INVENTORY_FULL_READ_ROLES)
  kardex(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query() query: MovementQueryDto,
  ) {
    return this.listMovements.execute({ ...query, productoId });
  }

  @Get('reservas')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  reservations(@Query() query: ReservationQueryDto) {
    return this.listReservations.execute(query);
  }

  @Get('reservas/:id')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  reservation(@Param('id', ParseIntPipe) id: number) {
    return this.getReservation.execute(id);
  }

  @Get('stocks/:id')
  @InventoryRoles(...INVENTORY_FULL_READ_ROLES)
  stock(@Param('id', ParseIntPipe) id: number) {
    return this.getStock.execute(id);
  }

  @Post('entradas')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  entry(
    @Body() dto: RegisterEntryDto,
    @CurrentInventoryActorId() actorId: number,
  ) {
    console.log('entrando a entradas');
    return this.registerEntry.execute({
      bodegaId: dto.bodegaId,
      productoId: dto.productoId,
      cantidad: dto.cantidad,
      costoUnitario: dto.costoUnitario,
      proveedorId: dto.proveedorId,
      reference:
        dto.referenciaTipo && dto.referenciaId
          ? { type: dto.referenciaTipo, id: dto.referenciaId }
          : null,
      observaciones: dto.observaciones,
      claveIdempotencia: dto.claveIdempotencia,
      actorId,
    });
  }

  @Post('ajustes')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  adjustment(
    @Body() dto: AdjustInventoryDto,
    @CurrentInventoryActorId() actorId: number,
  ) {
    return this.adjustInventory.execute({ ...dto, actorId });
  }

  @Post('devoluciones')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  returnStock(
    @Body() dto: RegisterReturnDto,
    @CurrentInventoryActorId() actorId: number,
  ) {
    return this.registerReturn.execute({
      bodegaId: dto.bodegaId,
      productoId: dto.productoId,
      cantidad: dto.cantidad,
      costoUnitario: dto.costoUnitario,
      reference:
        dto.referenciaTipo && dto.referenciaId
          ? { type: dto.referenciaTipo, id: dto.referenciaId }
          : null,
      observaciones: dto.observaciones,
      claveIdempotencia: dto.claveIdempotencia,
      actorId,
    });
  }

  @Post('reservas')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  reserve(
    @Body() dto: ReserveInventoryDto,
    @CurrentInventoryActorId() actorId: number,
  ) {
    return this.reserveInventory.execute({ ...dto, actorId });
  }

  @Patch('reservas/:id/aplicar')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  apply(
    @Param('id', ParseIntPipe) reservaId: number,
    @Body() dto: ReservationMutationDto,
    @CurrentInventoryActorId() actorId: number,
  ) {
    return this.applyReservation.execute({
      reservaId,
      cantidad: dto.cantidad,
      reference:
        dto.referenciaTipo && dto.referenciaId
          ? { type: dto.referenciaTipo, id: dto.referenciaId }
          : null,
      observaciones: dto.observaciones,
      claveIdempotencia: dto.claveIdempotencia,
      actorId,
    });
  }

  @Patch('reservas/:id/liberar')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  release(
    @Param('id', ParseIntPipe) reservaId: number,
    @Body() dto: ReservationMutationDto,
    @CurrentInventoryActorId() actorId: number,
  ) {
    return this.releaseReservation.execute({
      reservaId,
      cantidad: dto.cantidad,
      reference:
        dto.referenciaTipo && dto.referenciaId
          ? { type: dto.referenciaTipo, id: dto.referenciaId }
          : null,
      observaciones: dto.observaciones,
      claveIdempotencia: dto.claveIdempotencia,
      actorId,
    });
  }

  @Patch('reservas/:id/cancelar')
  @InventoryRoles(...INVENTORY_MANAGEMENT_ROLES)
  cancel(
    @Param('id', ParseIntPipe) reservaId: number,
    @Body() dto: CancelReservationDto,
    @CurrentInventoryActorId() actorId: number,
  ) {
    return this.cancelReservation.execute({
      reservaId,
      motivo: dto.motivo,
      reference:
        dto.referenciaTipo && dto.referenciaId
          ? { type: dto.referenciaTipo, id: dto.referenciaId }
          : null,
      claveIdempotencia: dto.claveIdempotencia,
      actorId,
    });
  }
}
