import { BodegaDirectoryPort } from '../../../bodegas';
import { OrderDirectoryPort } from '../../../pedidos';
import { OrdenDespacho } from '../../domain/entities/dispatch-order.entity';
import {
  DispatchOrderNotEligibleError,
  DispatchOrderNotFoundError,
  DispatchQuantityExceededError,
  DispatchValidationError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { CreateDispatchCommand } from '../models/dispatch.models';
import {
  assertDispatchOperator,
  requireDispatchActor,
  requireOperationalWarehouse,
} from './dispatch-use-case.helpers';

export class CreateDispatchUseCase {
  constructor(
    private readonly repository: DispatchRepositoryPort,
    private readonly users: DispatchActorDirectoryPort,
    private readonly orders: OrderDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
  ) {}

  async execute(command: CreateDispatchCommand) {
    const actor = await requireDispatchActor(this.users, command.actorId);
    assertDispatchOperator(actor);

    const order = await this.orders.findById(command.pedidoId);
    if (!order) throw new DispatchOrderNotFoundError(command.pedidoId);
    if (order.empresaId !== actor.empresaId) {
      throw new DispatchOrderNotEligibleError(order.estado, {
        reason: 'El pedido pertenece a otra empresa.',
      });
    }

    if (
      !['CONFIRMADO', 'EN_PREPARACION', 'PARCIALMENTE_DESPACHADO'].includes(
        order.estado,
      )
    ) {
      throw new DispatchOrderNotEligibleError(order.estado);
    }

    await requireOperationalWarehouse(
      this.bodegas,
      command.bodegaId,
      actor.empresaId,
    );

    const alreadyProgrammed =
      await this.repository.activeProgrammedByOrderDetail(order.id);

    if (!command.detalles.length) {
      throw new DispatchValidationError(
        'Debe indicarse al menos una línea para el despacho.',
      );
    }

    const seen = new Set<number>();
    const orderDetails = new Map(order.detalles.map((detail) => [detail.id, detail]));

    const details = command.detalles.map((line) => {
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
          cantidadSolicitada: detail.cantidadSolicitada,
          yaComprometida: committed,
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

    const entity = OrdenDespacho.create({
      pedidoId: order.id,
      bodegaId: command.bodegaId,
      creadoPorId: actor.id,
      programadoEn: command.programadoEn ?? null,
      observaciones: command.observaciones ?? null,
      detalles: details,
    });

    return this.repository.create(entity, {
      actorId: actor.id,
      tipo: 'CREADA',
      detalle: 'Orden de despacho creada.',
      metadata: {
        pedidoId: order.id,
        bodegaId: command.bodegaId,
        lineas: details.length,
        unidades: details.reduce(
          (sum, line) => sum + line.cantidadProgramada,
          0,
        ),
      },
    });
  }
}
