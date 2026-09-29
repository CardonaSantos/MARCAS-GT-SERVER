import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  OrderCreditGatePort,
  OrderCreditGateResult,
} from '../../application/ports/order-credit-gate.port';
import {
  OrderForbiddenError,
  OrderNotFoundError,
} from '../../domain/errors/order.errors';
import { OrderRepositoryPort } from '../../domain/ports/order.repository.port';
import { ORDER_REPOSITORY } from '../../order.tokens';

@Injectable()
export class OrderCreditGateAdapter implements OrderCreditGatePort {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly repository: OrderRepositoryPort,
    private readonly prisma: PrismaService,
  ) {}

  async confirmApprovedCredit(command: {
    pedidoId: number;
    solicitudCreditoId: number;
    actorId: number;
    empresaId: number;
  }): Promise<OrderCreditGateResult> {
    if (
      await this.hasEvent(
        command.pedidoId,
        'CREDITO_APROBADO',
        command.solicitudCreditoId,
      )
    ) {
      const order = await this.requireOrder(command.pedidoId, command.empresaId);
      return { repeated: true, pedidoId: order.id!, estado: order.estado };
    }

    const order = await this.requireOrder(command.pedidoId, command.empresaId);
    const expectedVersion = order.version;
    order.confirm(new Date(), true);

    const saved = await this.repository.save(order, expectedVersion, {
      actorId: command.actorId,
      tipo: 'CREDITO_APROBADO',
      detalle: 'Pedido confirmado por aprobación de crédito.',
      referencia: {
        tipo: 'SOLICITUD_CREDITO',
        id: command.solicitudCreditoId,
      },
    });

    return { repeated: false, pedidoId: saved.id!, estado: saved.estado };
  }

  async registerCreditRejection(command: {
    pedidoId: number;
    solicitudCreditoId: number;
    actorId: number;
    empresaId: number;
    motivo: string;
  }): Promise<OrderCreditGateResult> {
    if (
      await this.hasEvent(
        command.pedidoId,
        'CREDITO_RECHAZADO',
        command.solicitudCreditoId,
      )
    ) {
      const order = await this.requireOrder(command.pedidoId, command.empresaId);
      return { repeated: true, pedidoId: order.id!, estado: order.estado };
    }

    const order = await this.requireOrder(command.pedidoId, command.empresaId);

    // Si el Pedido fue cancelado por su propio flujo mientras Crédito estaba
    // en revisión, el rechazo/cancelación del expediente no debe resucitarlo.
    if (order.estado === 'CANCELADO') {
      return { repeated: false, pedidoId: order.id!, estado: order.estado };
    }

    const expectedVersion = order.version;
    order.returnToDraftAfterCreditRejection();

    const saved = await this.repository.save(order, expectedVersion, {
      actorId: command.actorId,
      tipo: 'CREDITO_RECHAZADO',
      detalle: command.motivo,
      referencia: {
        tipo: 'SOLICITUD_CREDITO',
        id: command.solicitudCreditoId,
      },
    });

    return { repeated: false, pedidoId: saved.id!, estado: saved.estado };
  }

  private async requireOrder(pedidoId: number, empresaId: number) {
    const order = await this.repository.findById(pedidoId);
    if (!order) throw new OrderNotFoundError(pedidoId);
    if (order.empresaId !== empresaId) throw new OrderForbiddenError();
    return order;
  }

  private async hasEvent(
    pedidoId: number,
    tipo: 'CREDITO_APROBADO' | 'CREDITO_RECHAZADO',
    solicitudCreditoId: number,
  ): Promise<boolean> {
    const event = await this.prisma.pedidoEvento.findFirst({
      where: {
        pedidoId,
        tipo,
        referenciaTipo: 'SOLICITUD_CREDITO',
        referenciaId: solicitudCreditoId,
      },
      select: { id: true },
    });
    return Boolean(event);
  }
}
