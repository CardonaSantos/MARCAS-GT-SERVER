import { OrderNotFoundError } from '../../domain/errors/order.errors';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { assertOrderEditAccess, requireOrderActor } from './order-use-case.helpers';

export class RequestOrderValidationUseCase {
  constructor(
    private readonly repository: OrderRepositoryPort,
    private readonly users: OrderActorDirectoryPort,
  ) {}

  async execute(command: { id: number; actorId: number }) {
    const actor = await requireOrderActor(this.users, command.actorId);
    const order = await this.repository.findById(command.id);
    if (!order) throw new OrderNotFoundError(command.id);
    assertOrderEditAccess(actor, order);
    const expectedVersion = order.version;
    order.requestValidation();
    return this.repository.save(order, expectedVersion, {
      actorId: actor.id,
      tipo: 'VALIDACION_SOLICITADA',
      detalle: 'Pedido enviado a validación.',
    });
  }
}
