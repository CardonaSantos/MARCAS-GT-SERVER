import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  OrderDispatchGatePort,
  OrderDispatchGateResult,
} from '../../application/ports/order-dispatch-gate.port';
import {
  OrderConcurrentModificationError,
  OrderForbiddenError,
  OrderInvalidStateError,
  OrderNotFoundError,
  OrderValidationError,
} from '../../domain/errors/order.errors';

@Injectable()
export class OrderDispatchGateAdapter implements OrderDispatchGatePort {
  constructor(private readonly prisma: PrismaService) {}

  startPreparation(command: {
    pedidoId: number;
    ordenDespachoId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderDispatchGateResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const repeated = await this.hasReferenceEvent(
            tx,
            command.pedidoId,
            'PREPARACION_INICIADA',
            'ORDEN_DESPACHO',
            command.ordenDespachoId,
          );

          const order = await this.requireOrder(
            tx,
            command.pedidoId,
            command.empresaId,
          );

          if (repeated) {
            return {
              repeated: true,
              pedidoId: order.id,
              estado: order.estado,
            };
          }

          if (
            ![
              'CONFIRMADO',
              'EN_PREPARACION',
              'PARCIALMENTE_DESPACHADO',
            ].includes(order.estado)
          ) {
            throw new OrderInvalidStateError(
              order.estado,
              'iniciar preparación desde Despachos',
            );
          }

          const nextState =
            order.estado === 'CONFIRMADO'
              ? 'EN_PREPARACION'
              : order.estado;

          if (nextState !== order.estado) {
            const changed = await tx.pedido.updateMany({
              where: { id: order.id, version: order.version },
              data: {
                estado: nextState,
                version: { increment: 1 },
              },
            });

            if (changed.count !== 1) {
              throw new OrderConcurrentModificationError({
                pedidoId: order.id,
              });
            }
          }

          await tx.pedidoEvento.create({
            data: {
              pedidoId: order.id,
              usuarioId: command.actorId,
              tipo: 'PREPARACION_INICIADA',
              detalle:
                'Preparación iniciada desde una orden de despacho.',
              referenciaTipo: 'ORDEN_DESPACHO',
              referenciaId: command.ordenDespachoId,
            },
          });

          return {
            repeated: false,
            pedidoId: order.id,
            estado: nextState,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
  }

  registerDispatch(command: {
    pedidoId: number;
    pedidoDetalleId: number;
    cantidad: number;
    movimientoInventarioId: number;
    operacionDespachoDetalleId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderDispatchGateResult> {
    if (!Number.isInteger(command.cantidad) || command.cantidad <= 0) {
      throw new OrderValidationError(
        'La cantidad despachada debe ser un entero positivo.',
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const repeated = await this.hasReferenceEvent(
            tx,
            command.pedidoId,
            undefined,
            'MOVIMIENTO_INVENTARIO',
            command.movimientoInventarioId,
          );

          const order = await this.requireOrder(
            tx,
            command.pedidoId,
            command.empresaId,
          );

          if (repeated) {
            return {
              repeated: true,
              pedidoId: order.id,
              estado: order.estado,
            };
          }

          if (
            ![
              'EN_PREPARACION',
              'PARCIALMENTE_DESPACHADO',
            ].includes(order.estado)
          ) {
            throw new OrderInvalidStateError(
              order.estado,
              'registrar despacho físico',
            );
          }

          const detail = await tx.pedidoDetalle.findFirst({
            where: {
              id: command.pedidoDetalleId,
              pedidoId: order.id,
            },
          });

          if (!detail) {
            throw new OrderValidationError(
              'El detalle indicado no pertenece al pedido.',
              { pedidoDetalleId: command.pedidoDetalleId },
            );
          }

          const nextQuantity =
            detail.cantidadDespachada + command.cantidad;

          if (nextQuantity > detail.cantidadSolicitada) {
            throw new OrderValidationError(
              'La cantidad despachada excede la cantidad solicitada.',
              {
                pedidoDetalleId: detail.id,
                solicitada: detail.cantidadSolicitada,
                despachadaActual: detail.cantidadDespachada,
                cantidad: command.cantidad,
              },
            );
          }

          const detailChanged = await tx.pedidoDetalle.updateMany({
            where: {
              id: detail.id,
              version: detail.version,
            },
            data: {
              cantidadDespachada: nextQuantity,
              version: { increment: 1 },
            },
          });

          if (detailChanged.count !== 1) {
            throw new OrderConcurrentModificationError({
              pedidoDetalleId: detail.id,
            });
          }

          const details = await tx.pedidoDetalle.findMany({
            where: { pedidoId: order.id },
            select: {
              cantidadSolicitada: true,
              cantidadReservada: true,
              cantidadDespachada: true,
            },
          });

          const nextState = deriveOrderOperationalState(details);

          const orderChanged = await tx.pedido.updateMany({
            where: {
              id: order.id,
              version: order.version,
            },
            data: {
              estado: nextState,
              version: { increment: 1 },
            },
          });

          if (orderChanged.count !== 1) {
            throw new OrderConcurrentModificationError({
              pedidoId: order.id,
            });
          }

          await tx.pedidoEvento.create({
            data: {
              pedidoId: order.id,
              usuarioId: command.actorId,
              tipo:
                nextState === 'DESPACHADO'
                  ? 'DESPACHADO'
                  : 'DESPACHO_PARCIAL',
              detalle: `Salida física registrada: ${command.cantidad} unidades. Operación detalle #${command.operacionDespachoDetalleId}.`,
              referenciaTipo: 'MOVIMIENTO_INVENTARIO',
              referenciaId: command.movimientoInventarioId,
            },
          });

          return {
            repeated: false,
            pedidoId: order.id,
            estado: nextState,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
  }

  releasePreparation(command: {
    pedidoId: number;
    ordenDespachoId: number;
    operacionDespachoId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderDispatchGateResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const repeated = await this.hasReferenceEvent(
            tx,
            command.pedidoId,
            'RESERVA_LIBERADA',
            'OPERACION_DESPACHO',
            command.operacionDespachoId,
          );

          const order = await this.requireOrder(
            tx,
            command.pedidoId,
            command.empresaId,
          );

          if (repeated) {
            return {
              repeated: true,
              pedidoId: order.id,
              estado: order.estado,
            };
          }

          if (
            ![
              'CONFIRMADO',
              'EN_PREPARACION',
              'PARCIALMENTE_DESPACHADO',
            ].includes(order.estado)
          ) {
            throw new OrderInvalidStateError(
              order.estado,
              'liberar preparación desde Despachos',
            );
          }

          const details = await tx.pedidoDetalle.findMany({
            where: { pedidoId: order.id },
            select: {
              cantidadSolicitada: true,
              cantidadReservada: true,
              cantidadDespachada: true,
            },
          });

          const nextState = deriveOrderOperationalState(details);

          if (nextState !== order.estado) {
            const changed = await tx.pedido.updateMany({
              where: { id: order.id, version: order.version },
              data: {
                estado: nextState,
                version: { increment: 1 },
              },
            });

            if (changed.count !== 1) {
              throw new OrderConcurrentModificationError({
                pedidoId: order.id,
              });
            }
          }

          await tx.pedidoEvento.create({
            data: {
              pedidoId: order.id,
              usuarioId: command.actorId,
              tipo: 'RESERVA_LIBERADA',
              detalle: `Reservas liberadas por la orden de despacho #${command.ordenDespachoId}.`,
              referenciaTipo: 'OPERACION_DESPACHO',
              referenciaId: command.operacionDespachoId,
            },
          });

          return {
            repeated: false,
            pedidoId: order.id,
            estado: nextState,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
  }

  private async requireOrder(
    tx: Prisma.TransactionClient,
    pedidoId: number,
    empresaId: number,
  ) {
    const order = await tx.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        empresaId: true,
        estado: true,
        version: true,
      },
    });

    if (!order) throw new OrderNotFoundError(pedidoId);
    if (order.empresaId !== empresaId) {
      throw new OrderForbiddenError();
    }

    return order;
  }

  private async hasReferenceEvent(
    tx: Prisma.TransactionClient,
    pedidoId: number,
    tipo: any | undefined,
    referenciaTipo: string,
    referenciaId: number,
  ): Promise<boolean> {
    const event = await tx.pedidoEvento.findFirst({
      where: {
        pedidoId,
        ...(tipo ? { tipo } : {}),
        referenciaTipo,
        referenciaId,
      },
      select: { id: true },
    });

    return Boolean(event);
  }

  private async withSerializableRetry<T>(
    work: () => Promise<T>,
    attempts = 3,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof OrderConcurrentModificationError ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034');

        if (!retryable || attempt === attempts) throw error;
      }
    }

    throw lastError;
  }
}

function deriveOrderOperationalState(
  details: ReadonlyArray<{
    cantidadSolicitada: number;
    cantidadReservada: number;
    cantidadDespachada: number;
  }>,
):
  | 'CONFIRMADO'
  | 'EN_PREPARACION'
  | 'PARCIALMENTE_DESPACHADO'
  | 'DESPACHADO' {
  const complete =
    details.length > 0 &&
    details.every(
      (detail) =>
        detail.cantidadDespachada >= detail.cantidadSolicitada,
    );

  if (complete) return 'DESPACHADO';

  const hasDispatch = details.some(
    (detail) => detail.cantidadDespachada > 0,
  );
  if (hasDispatch) return 'PARCIALMENTE_DESPACHADO';

  const hasReservation = details.some(
    (detail) => detail.cantidadReservada > 0,
  );
  return hasReservation ? 'EN_PREPARACION' : 'CONFIRMADO';
}
