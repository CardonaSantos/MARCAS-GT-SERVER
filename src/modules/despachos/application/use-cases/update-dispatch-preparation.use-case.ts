import { OrderDirectoryPort } from '../../../pedidos';
import {
  DispatchForbiddenError,
  DispatchNotFoundError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { UpdateDispatchPreparationCommand } from '../models/dispatch.models';
import {
  assertDispatchOperator,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class UpdateDispatchPreparationUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
  ) {}

  async execute(command: UpdateDispatchPreparationCommand) {
    const actor = await requireDispatchActor(this.users, command.actorId);
    assertDispatchOperator(actor);

    const dispatch = await this.repository.findById(command.id);
    if (!dispatch) throw new DispatchNotFoundError(command.id);

    const order = await this.orders.findById(dispatch.pedidoId);
    if (!order || order.empresaId !== actor.empresaId) {
      throw new DispatchForbiddenError();
    }

    const expected = dispatch.version;
    dispatch.updatePreparation(
      command.detalles.map((line) => ({
        detalleId: line.detalleId,
        cantidadPreparada: line.cantidadPreparada,
        observaciones: line.observaciones,
      })),
    );

    return this.repository.save(dispatch, expected, [
      {
        actorId: actor.id,
        tipo: 'PREPARACION_AJUSTADA',
        detalle: 'Cantidades preparadas actualizadas.',
        metadata: {
          lineas: command.detalles.map((line) => ({
            detalleId: line.detalleId,
            cantidadPreparada: line.cantidadPreparada,
          })),
        },
      },
    ]);
  }
}
