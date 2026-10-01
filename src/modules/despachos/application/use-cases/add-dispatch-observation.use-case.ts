import { OrderDirectoryPort } from '../../../pedidos';
import {
  DispatchForbiddenError,
  DispatchNotFoundError,
  DispatchValidationError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { AddDispatchObservationCommand } from '../models/dispatch.models';
import { requireDispatchActor } from './dispatch-use-case.helpers';

export class AddDispatchObservationUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
  ) {}

  async execute(command: AddDispatchObservationCommand) {
    const actor = await requireDispatchActor(this.users, command.actorId);

    const dispatch = await this.repository.findById(command.id);
    if (!dispatch) throw new DispatchNotFoundError(command.id);

    const order = await this.orders.findById(dispatch.pedidoId);
    if (!order || order.empresaId !== actor.empresaId) {
      throw new DispatchForbiddenError();
    }
    if (actor.rol === 'VENDEDOR' && order.vendedorId !== actor.id) {
      throw new DispatchForbiddenError();
    }

    const text = command.detalle.trim();
    if (text.length < 2) {
      throw new DispatchValidationError(
        'La observación debe contener al menos 2 caracteres.',
      );
    }

    await this.repository.appendEvent(command.id, {
      actorId: actor.id,
      tipo: 'OBSERVACION',
      detalle: text,
    });
  }
}
