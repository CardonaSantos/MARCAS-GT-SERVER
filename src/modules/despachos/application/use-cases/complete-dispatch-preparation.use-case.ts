import { OrderDirectoryPort } from '../../../pedidos';
import {
  DispatchForbiddenError,
  DispatchNotFoundError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import {
  assertDispatchOperator,
  requireDispatchActor,
} from './dispatch-use-case.helpers';

export class CompleteDispatchPreparationUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
  ) {}

  async execute(id: number, actorId: number) {
    const actor = await requireDispatchActor(this.users, actorId);
    assertDispatchOperator(actor);

    const dispatch = await this.repository.findById(id);
    if (!dispatch) throw new DispatchNotFoundError(id);

    const order = await this.orders.findById(dispatch.pedidoId);
    if (!order || order.empresaId !== actor.empresaId) {
      throw new DispatchForbiddenError();
    }

    const expected = dispatch.version;
    dispatch.markPrepared(actor.id, new Date());

    return this.repository.save(dispatch, expected, [
      {
        actorId: actor.id,
        tipo: 'PREPARADA',
        detalle: 'Preparación física confirmada como completa.',
        metadata: {
          unidades: dispatch.detalles.reduce(
            (sum, line) => sum + (line.cantidadPreparada ?? 0),
            0,
          ),
        },
      },
    ]);
  }
}
