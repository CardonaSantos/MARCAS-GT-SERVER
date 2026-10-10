import { Pago } from '../../domain/entities/payment.entity';
import {
  PaymentForbiddenError,
  PaymentIdempotencyConflictError,
  PaymentValidationError,
} from '../../domain/errors/payment.errors';
import { PaymentMoney } from '../../domain/value-objects/payment-money.vo';
import { PaymentMethod } from '../../payment.types';
import { PaymentActorDirectoryPort } from '../ports/payment-actor-directory.port';
import { PaymentContextPort } from '../ports/payment-context.port';
import { PaymentWorkflowPort } from '../ports/payment-workflow.port';
import {
  assertPaymentRegistrar,
  requirePaymentActor,
} from './payment.helpers';

export class RegisterPaymentUseCase {
  constructor(
    private readonly workflow: PaymentWorkflowPort,
    private readonly actors: PaymentActorDirectoryPort,
    private readonly context: PaymentContextPort,
  ) {}

  async execute(command: {
    actorId: number;
    clienteId: number;
    pedidoId?: number;
    bancoId?: number;
    concepto?: 'ANTICIPO' | 'CUOTA';
    metodo: PaymentMethod;
    moneda?: string;
    monto: string;
    referencia?: string;
    fechaPago?: Date;
    observaciones?: string;
    claveIdempotencia: string;
  }) {
    const actor = await requirePaymentActor(this.actors, command.actorId);
    assertPaymentRegistrar(actor);

    const amount = PaymentMoney.from(command.monto);

    if (!amount.isPositive()) {
      throw new PaymentValidationError(
        'El monto del pago debe ser mayor a cero.',
      );
    }

    const moneda = (command.moneda ?? 'GTQ').trim().toUpperCase();
    const referencia = normalize(command.referencia);

    const existing = await this.workflow.findByCreationKey(
      command.claveIdempotencia,
    );

    if (existing) {
      if (
        existing.empresaId !== actor.empresaId ||
        existing.clienteId !== command.clienteId ||
        existing.pedidoId !== (command.pedidoId ?? null) ||
        existing.bancoId !== (command.bancoId ?? null) ||
        existing.metodo !== command.metodo ||
        existing.moneda !== moneda ||
        existing.monto !== amount.toString() ||
        existing.referencia !== referencia
      ) {
        throw new PaymentIdempotencyConflictError({
          claveIdempotencia: command.claveIdempotencia,
        });
      }

      return existing;
    }

    if (!(await this.context.customerExists(command.clienteId))) {
      throw new PaymentValidationError(
        'El cliente indicado no existe.',
        { clienteId: command.clienteId },
      );
    }

    if (actor.rol === 'VENDEDOR' && !command.pedidoId) {
      throw new PaymentForbiddenError(
        'VENDEDOR debe registrar el pago sobre uno de sus pedidos.',
      );
    }

    if (command.pedidoId) {
      const order = await this.context.findOrder(command.pedidoId);

      if (!order) {
        throw new PaymentValidationError(
          'El pedido indicado no existe.',
          { pedidoId: command.pedidoId },
        );
      }

      if (
        order.empresaId !== actor.empresaId ||
        order.clienteId !== command.clienteId
      ) {
        throw new PaymentForbiddenError(
          'El pedido no pertenece a la empresa y cliente del pago.',
        );
      }

      if (actor.rol === 'VENDEDOR' && order.vendedorId !== actor.id) {
        throw new PaymentForbiddenError(
          'VENDEDOR solo puede registrar pagos de sus propios pedidos.',
        );
      }

      if (order.estado === 'CANCELADO') {
        throw new PaymentValidationError(
          'No se pueden registrar nuevos pagos sobre un pedido cancelado.',
        );
      }

      if (order.moneda.trim().toUpperCase() !== moneda) {
        throw new PaymentValidationError(
          'La moneda del pago no coincide con la moneda del pedido.',
        );
      }
    }

    if (command.bancoId) {
      const bank = await this.context.findBank(command.bancoId);

      if (!bank || !bank.activo || bank.empresaId !== actor.empresaId) {
        throw new PaymentValidationError(
          'El banco indicado no existe, está inactivo o pertenece a otra empresa.',
        );
      }
    }

    const payment = Pago.create({
      empresaId: actor.empresaId,
      clienteId: command.clienteId,
      pedidoId: command.pedidoId ?? null,
      bancoId: command.bancoId ?? null,
      registradoPorId: actor.id,
      metodo: command.metodo,
      moneda,
      monto: amount.toString(),
      referencia,
      fechaPago: command.fechaPago ?? new Date(),
      observaciones: normalize(command.observaciones),
      claveIdempotencia: command.claveIdempotencia,
    });

    return this.workflow.register({
      empresaId: payment.empresaId,
      clienteId: payment.clienteId,
      pedidoId: payment.pedidoId,
      bancoId: payment.bancoId,
      concepto: command.concepto,
      registradoPorId: actor.id,
      metodo: payment.metodo,
      moneda: payment.moneda,
      monto: payment.monto,
      referencia: payment.referencia,
      fechaPago: payment.fechaPago,
      observaciones: payment.observaciones,
      claveIdempotencia: command.claveIdempotencia,
    });
  }
}

function normalize(value?: string | null): string | null {
  if (value == null) {
    return null;
  }

  const result = value.trim();
  return result.length ? result : null;
}
