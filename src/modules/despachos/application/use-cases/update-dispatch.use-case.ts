import { BodegaDirectoryPort } from '../../../bodegas';
import { OrderDirectoryPort } from '../../../pedidos';
import {
  DispatchNotFoundError,
  DispatchOrderNotEligibleError,
  DispatchQuantityExceededError,
  DispatchValidationError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { UpdateDispatchCommand } from '../models/dispatch.models';
import {
  assertDispatchOperator,
  requireDispatchActor,
  requireOperationalWarehouse,
} from './dispatch-use-case.helpers';

export class UpdateDispatchUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
  ) {}

  async execute(command: UpdateDispatchCommand) {
    const actor = await requireDispatchActor(this.users, command.actorId);
    assertDispatchOperator(actor);

    const dispatch = await this.repository.findById(command.id);
    if (!dispatch) throw new DispatchNotFoundError(command.id);

    if (dispatch.estado !== 'PENDIENTE') {
      throw new DispatchOrderNotEligibleError(dispatch.estado, {
        reason: 'Solo un despacho pendiente puede editarse.',
      });
    }

    if (await this.repository.hasOperations(command.id)) {
      throw new DispatchValidationError(
        'No se puede editar la planificación después de crear operaciones.',
      );
    }

    const order = await this.orders.findById(dispatch.pedidoId);
    if (!order || order.empresaId !== actor.empresaId) {
      throw new DispatchOrderNotEligibleError(order?.estado ?? 'NO_ENCONTRADO');
    }

    const bodegaId = command.bodegaId ?? dispatch.bodegaId;
    await requireOperationalWarehouse(this.bodegas, bodegaId, actor.empresaId);

    let details = undefined;
    if (command.detalles) {
      const alreadyProgrammed =
        await this.repository.activeProgrammedByOrderDetail(
          order.id,
          dispatch.id!,
        );
      const orderDetails = new Map(order.detalles.map((detail) => [detail.id, detail]));
      const seen = new Set<number>();

      details = command.detalles.map((line) => {
        if (seen.has(line.pedidoDetalleId)) {
          throw new DispatchValidationError(
            'No se puede repetir un detalle de pedido.',
          );
        }
        seen.add(line.pedidoDetalleId);

        const detail = orderDetails.get(line.pedidoDetalleId);
        if (!detail) {
          throw new DispatchValidationError(
            'Una línea no pertenece al pedido.',
            { pedidoDetalleId: line.pedidoDetalleId },
          );
        }

        const committed = Math.max(
          alreadyProgrammed.get(detail.id) ?? 0,
          detail.cantidadDespachada,
        );
        const capacity = detail.cantidadSolicitada - committed;

        if (
          !Number.isInteger(line.cantidadProgramada) ||
          line.cantidadProgramada <= 0 ||
          line.cantidadProgramada > capacity
        ) {
          throw new DispatchQuantityExceededError({
            pedidoDetalleId: detail.id,
            disponibleParaProgramar: capacity,
            solicitada: line.cantidadProgramada,
          });
        }

        return {
          pedidoDetalleId: detail.id,
          productoId: detail.productoId,
          cantidadProgramada: line.cantidadProgramada,
          cantidadPreparada: 0,
          cantidadDespachada: 0,
          observaciones: line.observaciones ?? null,
          version: 0,
        };
      });
    }

    const expected = dispatch.version;
    dispatch.replacePendingData({
      bodegaId,
      ...(command.programadoEn !== undefined
        ? { programadoEn: command.programadoEn }
        : {}),
      ...(command.observaciones !== undefined
        ? { observaciones: command.observaciones }
        : {}),
      ...(details ? { detalles: details } : {}),
    });

    return this.repository.save(
      dispatch,
      expected,
      [
        {
          actorId: actor.id,
          tipo: 'ACTUALIZADA',
          detalle: 'Planificación de despacho actualizada.',
        },
      ],
      { replaceDetails: Boolean(details) },
    );
  }
}
