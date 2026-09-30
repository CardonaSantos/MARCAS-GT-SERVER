import { Pedido } from '../../domain/entities/order.entity';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderCustomerDirectoryPort } from '../../domain/ports/order-customer-directory.port';
import { OrderProductCatalogPort } from '../../domain/ports/order-product-catalog.port';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { OrderVisitDirectoryPort } from '../../domain/ports/order-visit-directory.port';
import { CreateOrderCommand } from '../models/order.models';
import {
  assertOrderCustomer,
  assertOrderVisit,
  buildOrderDetails,
  requireOrderActor,
  resolveOrderSeller,
} from './order-use-case.helpers';

export class CreateOrderUseCase {
  constructor(
    private readonly repository: OrderRepositoryPort,
    private readonly users: OrderActorDirectoryPort,
    private readonly customers: OrderCustomerDirectoryPort,
    private readonly visits: OrderVisitDirectoryPort,
    private readonly products: OrderProductCatalogPort,
  ) {}

  async execute(command: CreateOrderCommand) {
    const actor = await requireOrderActor(this.users, command.actorId);
    const vendedorId = await resolveOrderSeller(this.users, actor, command.vendedorId);
    await assertOrderCustomer(this.customers, command.clienteId);
    await assertOrderVisit(
      this.visits,
      command.visitaId,
      command.clienteId,
      vendedorId,
    );
    const details = await buildOrderDetails(this.products, command.detalles ?? []);

    const entity = Pedido.create({
      empresaId: actor.empresaId,
      clienteId: command.clienteId,
      vendedorId,
      visitaId: command.visitaId ?? null,
      condicionPago: command.condicionPago,
      moneda: 'GTQ',
      observaciones: command.observaciones ?? null,
      detalles: details,
    });

    return this.repository.create(entity, {
      actorId: actor.id,
      tipo: 'CREADO',
      detalle: 'Pedido creado en borrador.',
    });
  }
}
