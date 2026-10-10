import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  OrderDeliveryGatePort,
  OrderDeliveryGateResult,
} from '../../application/ports/order-delivery-gate.port';
import {
  OrderConcurrentModificationError,
  OrderForbiddenError,
  OrderNotFoundError,
  OrderValidationError,
} from '../../domain/errors/order.errors';

@Injectable()
export class OrderDeliveryGateAdapter implements OrderDeliveryGatePort {
  constructor(private readonly prisma: PrismaService) {}

  registerDelivery(command: Parameters<OrderDeliveryGatePort['registerDelivery']>[0]): Promise<OrderDeliveryGateResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const previous = await tx.pedidoEvento.findFirst({
          where: {
            pedidoId: command.pedidoId,
            referenciaTipo: 'ENTREGA',
            referenciaId: command.entregaId,
          },
          select: { id: true },
        });

        const order = await tx.pedido.findUnique({
          where: { id: command.pedidoId },
          select: { id: true, empresaId: true, estado: true, condicionPago: true, version: true },
        });
        if (!order) throw new OrderNotFoundError(command.pedidoId);
        if (order.empresaId !== command.empresaId) throw new OrderForbiddenError();

        if (previous) {
          return { repeated: true, pedidoId: order.id, estado: order.estado };
        }

        // El anticipo MIXTO debe estar efectivamente aplicado antes de entregar mercadería.
        if (order.condicionPago === 'MIXTO' &&
            command.detalles.some((item) => item.cantidadEntregada > 0)) {
          const advance = await tx.cuentaPorCobrar.findUnique({
            where: { claveIdempotencia: 'credit-advance:order:' + order.id },
            select: { empresaId: true, estado: true, saldoPendiente: true },
          });
          if (!advance || advance.empresaId !== order.empresaId ||
              advance.estado !== 'PAGADA' || !advance.saldoPendiente.isZero()) {
            throw new OrderValidationError(
              'No se puede confirmar entrega de pedido MIXTO sin anticipo cobrado, verificado y aplicado.',
              { pedidoId: order.id },
            );
          }
        }

        const inputByDetail = new Map(command.detalles.map((x) => [x.pedidoDetalleId, x]));

        for (const item of command.detalles) {
          if (!Number.isInteger(item.cantidadEntregada) || item.cantidadEntregada < 0) {
            throw new OrderValidationError('La cantidad entregada debe ser un entero no negativo.');
          }
          if (item.cantidadEntregada === 0) continue;

          const detail = await tx.pedidoDetalle.findFirst({
            where: { id: item.pedidoDetalleId, pedidoId: order.id },
          });
          if (!detail) {
            throw new OrderValidationError('El detalle indicado no pertenece al pedido.', {
              pedidoDetalleId: item.pedidoDetalleId,
            });
          }

          const next = detail.cantidadEntregada + item.cantidadEntregada;
          if (next > detail.cantidadDespachada) {
            throw new OrderValidationError(
              'La cantidad entregada acumulada no puede exceder la cantidad despachada.',
              {
                pedidoDetalleId: detail.id,
                entregadaActual: detail.cantidadEntregada,
                cantidad: item.cantidadEntregada,
                despachada: detail.cantidadDespachada,
              },
            );
          }

          const changed = await tx.pedidoDetalle.updateMany({
            where: { id: detail.id, version: detail.version },
            data: { cantidadEntregada: next, version: { increment: 1 } },
          });
          if (changed.count !== 1) {
            throw new OrderConcurrentModificationError({ pedidoDetalleId: detail.id });
          }
        }

        const details = await tx.pedidoDetalle.findMany({
          where: { pedidoId: order.id },
          select: { cantidadSolicitada: true, cantidadDespachada: true, cantidadEntregada: true },
        });
        const anyDelivered = details.some((x) => x.cantidadEntregada > 0);
        const allDelivered =
          details.length > 0 &&
          details.every((x) => x.cantidadEntregada >= x.cantidadSolicitada);
        const nextState = allDelivered
          ? 'ENTREGADO'
          : anyDelivered
            ? 'PARCIALMENTE_ENTREGADO'
            : order.estado;

        if (nextState !== order.estado) {
          const changed = await tx.pedido.updateMany({
            where: { id: order.id, version: order.version },
            data: { estado: nextState as any, version: { increment: 1 } },
          });
          if (changed.count !== 1) {
            throw new OrderConcurrentModificationError({ pedidoId: order.id });
          }
        }

        const deliveredUnits = command.detalles.reduce((a, x) => a + x.cantidadEntregada, 0);
        await tx.pedidoEvento.create({
          data: {
            pedidoId: order.id,
            usuarioId: command.actorId,
            tipo:
              nextState === 'ENTREGADO'
                ? 'ENTREGADO'
                : deliveredUnits > 0
                  ? 'ENTREGA_PARCIAL'
                  : 'OBSERVACION',
            detalle:
              deliveredUnits > 0
                ? `Entrega #${command.entregaId}: ${deliveredUnits} unidades aceptadas.`
                : `Entrega #${command.entregaId} finalizada como ${command.resultado} sin unidades aceptadas.`,
            referenciaTipo: 'ENTREGA',
            referenciaId: command.entregaId,
          },
        });

        return { repeated: false, pedidoId: order.id, estado: nextState };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
  }

  private async withSerializableRetry<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 1; i <= attempts; i += 1) {
      try { return await work(); }
      catch (error) {
        last = error;
        const retryable =
          error instanceof OrderConcurrentModificationError ||
          (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034');
        if (!retryable || i === attempts) throw error;
      }
    }
    throw last;
  }
}
