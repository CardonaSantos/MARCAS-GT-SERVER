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
import { ActiveUserRolesGuard } from 'src/shared/security/active-user-roles.guard';
import { CurrentActorId } from 'src/shared/security/current-actor.decorator';
import { Roles } from 'src/shared/security/roles.decorator';
import { CancelOrderUseCase } from '../../application/use-cases/cancel-order.use-case';
import { ConfirmOrderUseCase } from '../../application/use-cases/confirm-order.use-case';
import { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import { GetOrderSummaryUseCase } from '../../application/use-cases/get-order-summary.use-case';
import { GetOrderUseCase } from '../../application/use-cases/get-order.use-case';
import { ListOrderEventsUseCase } from '../../application/use-cases/list-order-events.use-case';
import { ListOrdersUseCase } from '../../application/use-cases/list-orders.use-case';
import { RequestOrderValidationUseCase } from '../../application/use-cases/request-order-validation.use-case';
import { UpdateOrderUseCase } from '../../application/use-cases/update-order.use-case';
import {
  CreateOrderDto,
  OrderEventQueryDto,
  OrderListQueryDto,
  OrderReasonDto,
  OrderSummaryQueryDto,
  UpdateOrderDto,
} from './dto/order-http.dto';
import { OrderExceptionFilter } from './order-exception.filter';

const READ_ROLES = ['ADMIN', 'VENDEDOR', 'BODEGA', 'CONTABILIDAD'] as const;
const WRITE_ROLES = ['ADMIN', 'VENDEDOR', 'BODEGA'] as const;
const EDIT_ROLES = ['ADMIN', 'VENDEDOR', 'BODEGA'] as const;

@Controller('pedidos')
@UseGuards(AuthGuard('jwt'), ActiveUserRolesGuard)
@UseFilters(OrderExceptionFilter)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class OrderController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly updateOrder: UpdateOrderUseCase,
    private readonly requestValidation: RequestOrderValidationUseCase,
    private readonly confirmOrder: ConfirmOrderUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly listOrders: ListOrdersUseCase,
    private readonly getOrder: GetOrderUseCase,
    private readonly listEvents: ListOrderEventsUseCase,
    private readonly getSummary: GetOrderSummaryUseCase,
  ) {}

  @Post()
  @Roles(...WRITE_ROLES)
  async create(@Body() dto: CreateOrderDto, @CurrentActorId() actorId: number) {
    const created = await this.createOrder.execute({ ...dto, actorId });
    if (!created.id) throw new Error('El pedido persistido no tiene id.');
    return this.getOrder.execute(created.id, actorId);
  }

  @Get()
  @Roles(...READ_ROLES)
  list(@Query() query: OrderListQueryDto, @CurrentActorId() actorId: number) {
    return this.listOrders.execute(query, actorId);
  }

  @Get('resumen')
  @Roles(...READ_ROLES)
  summary(
    @Query() query: OrderSummaryQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.getSummary.execute(query, actorId);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    return this.getOrder.execute(id, actorId);
  }

  @Get(':id/eventos')
  @Roles(...READ_ROLES)
  events(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: OrderEventQueryDto,
    @CurrentActorId() actorId: number,
  ) {
    return this.listEvents.execute(id, query, actorId);
  }
  // kjnkj
  @Patch(':id')
  @Roles(...EDIT_ROLES)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.updateOrder.execute({ id, ...dto, actorId });
    return this.getOrder.execute(id, actorId);
  }

  @Patch(':id/solicitar-validacion')
  @Roles(...WRITE_ROLES)
  async request(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    await this.requestValidation.execute({ id, actorId });
    return this.getOrder.execute(id, actorId);
  }

  @Patch(':id/confirmar')
  @Roles('ADMIN')
  async confirm(
    @Param('id', ParseIntPipe) id: number,
    @CurrentActorId() actorId: number,
  ) {
    await this.confirmOrder.execute({ id, actorId });
    return this.getOrder.execute(id, actorId);
  }

  @Patch(':id/cancelar')
  @Roles(...WRITE_ROLES)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OrderReasonDto,
    @CurrentActorId() actorId: number,
  ) {
    await this.cancelOrder.execute({ id, motivo: dto.motivo, actorId });
    return this.getOrder.execute(id, actorId);
  }
}
