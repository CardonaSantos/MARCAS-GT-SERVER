import { OrderNotFoundError } from '../../domain/errors/order.errors';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderCustomerDirectoryPort } from '../../domain/ports/order-customer-directory.port';
import { OrderProductCatalogPort } from '../../domain/ports/order-product-catalog.port';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { OrderVisitDirectoryPort } from '../../domain/ports/order-visit-directory.port';
import { UpdateOrderCommand } from '../models/order.models';
import {
  assertOrderCustomer,
  assertOrderVisit,
  assertOrderEditAccess,
  buildOrderDetails,
  requireOrderActor,
  resolveOrderSeller,
} from './order-use-case.helpers';

export class UpdateOrderUseCase {
  constructor(
    private readonly repository: OrderRepositoryPort,
    private readonly users: OrderActorDirectoryPort,
    private readonly customers: OrderCustomerDirectoryPort,
    private readonly visits: OrderVisitDirectoryPort,
    private readonly products: OrderProductCatalogPort,
  ) {}

  async execute(command: UpdateOrderCommand) {
    const actor = await requireOrderActor(this.users, command.actorId);
    const order = await this.repository.findById(command.id);
    if (!order) throw new OrderNotFoundError(command.id);
    assertOrderEditAccess(actor, order);

    const vendedorId = command.vendedorId !== undefined
      ? await resolveOrderSeller(this.users, actor, command.vendedorId)
      : order.vendedorId;
    const clienteId = command.clienteId ?? order.clienteId;
    const visitaId = command.visitaId === undefined ? order.visitaId : command.visitaId;

    await assertOrderCustomer(this.customers, clienteId);
    await assertOrderVisit(this.visits, visitaId, clienteId, vendedorId);

    const details = command.detalles === undefined
      ? undefined
      : await buildOrderDetails(this.products, command.detalles);

    const expectedVersion = order.version;
    order.replaceDraftData({
      clienteId: command.clienteId,
      vendedorId: command.vendedorId === undefined ? undefined : vendedorId,
      visitaId: command.visitaId,
      condicionPago: command.condicionPago,
      observaciones: command.observaciones,
      detalles: details,
    });

    return this.repository.save(
      order,
      expectedVersion,
      {
        actorId: actor.id,
        tipo: 'ACTUALIZADO',
        detalle: 'Pedido actualizado en borrador.',
      },
      { replaceDetails: details !== undefined },
    );
  }
}
