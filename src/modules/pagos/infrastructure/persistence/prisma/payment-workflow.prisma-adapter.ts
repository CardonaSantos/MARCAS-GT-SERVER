import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  PaymentAvailableAmountExceededError,
  PaymentConcurrentModificationError,
  PaymentIdempotencyConflictError,
  PaymentInvalidStateError,
  PaymentNotFoundError,
  PaymentValidationError,
  ReceivableBalanceExceededError,
} from '../../../domain/errors/payment.errors';
import { PaymentMoney } from '../../../domain/value-objects/payment-money.vo';
import {
  PaymentApplicationSnapshot,
  PaymentSnapshot,
  PaymentWorkflowPort,
} from '../../../application/ports/payment-workflow.port';

@Injectable()
export class PaymentWorkflowPrismaAdapter implements PaymentWorkflowPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<PaymentSnapshot | null> {
    const row = await this.prisma.pago.findUnique({ where: { id } });
    return row ? mapPayment(row) : null;
  }

  async findByCreationKey(key: string): Promise<PaymentSnapshot | null> {
    const row = await this.prisma.pago.findUnique({
      where: { claveIdempotencia: key },
    });
    return row ? mapPayment(row) : null;
  }

  async findEventByKey(key: string) {
    return this.prisma.pagoEvento.findUnique({
      where: { claveIdempotencia: key },
      select: { pagoId: true, tipo: true },
    }) as any;
  }

  async findProofByKey(key: string) {
    return this.prisma.pagoComprobante.findUnique({
      where: { claveIdempotencia: key },
      select: { id: true, pagoId: true },
    });
  }

  async findApplicationById(id: number): Promise<PaymentApplicationSnapshot | null> {
    const row = await this.prisma.pagoAplicacion.findUnique({ where: { id } });
    return row ? mapApplication(row) : null;
  }

  async findApplicationByKey(key: string): Promise<PaymentApplicationSnapshot | null> {
    const row = await this.prisma.pagoAplicacion.findUnique({
      where: { claveIdempotencia: key },
    });
    return row ? mapApplication(row) : null;
  }

  register(input: Parameters<PaymentWorkflowPort['register']>[0]) {
    return this.withSerializableRetry(async (tx) => {
      const previous = await tx.pago.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
      });

      if (previous) {
        return mapPayment(previous);
      }

      const row = await tx.pago.create({
        data: {
          empresaId: input.empresaId,
          clienteId: input.clienteId,
          pedidoId: input.pedidoId,
          bancoId: input.bancoId,
          registradoPorId: input.registradoPorId,
          metodo: input.metodo as any,
          estado: 'PENDIENTE',
          moneda: input.moneda,
          monto: input.monto,
          referencia: input.referencia,
          fechaPago: input.fechaPago,
          observaciones: input.observaciones,
          claveIdempotencia: input.claveIdempotencia,
          eventos: {
            create: {
              usuarioId: input.registradoPorId,
              tipo: 'CREADO',
              estado: 'PENDIENTE',
              detalle: 'Pago registrado.',
              claveIdempotencia: input.claveIdempotencia + ':CREATED',
            },
          },
        },
      });

      return mapPayment(row);
    });
  }

  addProof(input: Parameters<PaymentWorkflowPort['addProof']>[0]) {
    return this.withSerializableRetry(async (tx) => {
      const previous = await tx.pagoComprobante.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
        select: { id: true, pagoId: true },
      });

      if (previous) {
        if (previous.pagoId !== input.pagoId) {
          throw new PaymentIdempotencyConflictError({
            claveIdempotencia: input.claveIdempotencia,
          });
        }
        return previous;
      }

      const payment = await tx.pago.findUnique({
        where: { id: input.pagoId },
        select: { id: true, estado: true, version: true },
      });

      if (!payment) {
        throw new PaymentNotFoundError(input.pagoId);
      }

      if (['RECHAZADO', 'ANULADO'].includes(payment.estado)) {
        throw new PaymentInvalidStateError(
          payment.estado,
          'agregar comprobantes a',
        );
      }

      if (payment.version !== input.expectedVersion) {
        throw new PaymentConcurrentModificationError({ pagoId: input.pagoId });
      }

      const proof = await tx.pagoComprobante.create({
        data: {
          pagoId: input.pagoId,
          subidoPorId: input.actorId,
          url: input.url,
          key: input.key,
          mimeType: input.mimeType,
          size: input.size,
          descripcion: input.descripcion,
          claveIdempotencia: input.claveIdempotencia,
        },
        select: { id: true, pagoId: true },
      });

      const changed = await tx.pago.updateMany({
        where: {
          id: input.pagoId,
          version: input.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });

      if (changed.count !== 1) {
        throw new PaymentConcurrentModificationError({ pagoId: input.pagoId });
      }

      await tx.pagoEvento.create({
        data: {
          pagoId: input.pagoId,
          usuarioId: input.actorId,
          tipo: 'COMPROBANTE_AGREGADO',
          estado: payment.estado,
          detalle: 'Comprobante agregado al pago.',
          referenciaTipo: 'PAGO_COMPROBANTE',
          referenciaId: proof.id,
          claveIdempotencia: input.claveIdempotencia + ':EVENT',
        },
      });

      return proof;
    });
  }

  verify(input: Parameters<PaymentWorkflowPort['verify']>[0]) {
    return this.withSerializableRetry(async (tx) => {
      const repeated = await tx.pagoEvento.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
        select: { pagoId: true, tipo: true },
      });

      if (repeated) {
        if (repeated.pagoId !== input.pagoId || repeated.tipo !== 'VERIFICADO') {
          throw new PaymentIdempotencyConflictError({
            claveIdempotencia: input.claveIdempotencia,
          });
        }
        const row = await tx.pago.findUniqueOrThrow({ where: { id: input.pagoId } });
        return mapPayment(row);
      }

      const payment = await tx.pago.findUnique({ where: { id: input.pagoId } });

      if (!payment) {
        throw new PaymentNotFoundError(input.pagoId);
      }

      if (payment.estado !== 'PENDIENTE') {
        throw new PaymentInvalidStateError(payment.estado, 'verificar');
      }

      const changed = await tx.pago.updateMany({
        where: {
          id: input.pagoId,
          version: input.expectedVersion,
          estado: 'PENDIENTE',
        },
        data: {
          estado: 'VERIFICADO',
          verificadoPorId: input.actorId,
          verificadoEn: input.at,
          version: { increment: 1 },
        },
      });

      if (changed.count !== 1) {
        throw new PaymentConcurrentModificationError({ pagoId: input.pagoId });
      }

      await tx.pagoEvento.create({
        data: {
          pagoId: input.pagoId,
          usuarioId: input.actorId,
          tipo: 'VERIFICADO',
          estado: 'VERIFICADO',
          detalle: 'Pago verificado.',
          claveIdempotencia: input.claveIdempotencia,
        },
      });

      if (payment.pedidoId) {
        await this.syncOrderPaymentState(tx, payment.pedidoId, input.actorId, input.pagoId);
      }

      const row = await tx.pago.findUniqueOrThrow({ where: { id: input.pagoId } });
      return mapPayment(row);
    });
  }

  reject(input: Parameters<PaymentWorkflowPort['reject']>[0]) {
    return this.withSerializableRetry(async (tx) => {
      const repeated = await tx.pagoEvento.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
        select: { pagoId: true, tipo: true },
      });

      if (repeated) {
        if (repeated.pagoId !== input.pagoId || repeated.tipo !== 'RECHAZADO') {
          throw new PaymentIdempotencyConflictError({
            claveIdempotencia: input.claveIdempotencia,
          });
        }
        const row = await tx.pago.findUniqueOrThrow({ where: { id: input.pagoId } });
        return mapPayment(row);
      }

      const payment = await tx.pago.findUnique({ where: { id: input.pagoId } });

      if (!payment) {
        throw new PaymentNotFoundError(input.pagoId);
      }

      if (payment.estado !== 'PENDIENTE') {
        throw new PaymentInvalidStateError(payment.estado, 'rechazar');
      }

      const reason = requireReason(input.motivo);

      const changed = await tx.pago.updateMany({
        where: {
          id: input.pagoId,
          version: input.expectedVersion,
          estado: 'PENDIENTE',
        },
        data: {
          estado: 'RECHAZADO',
          rechazadoPorId: input.actorId,
          rechazadoEn: input.at,
          motivoRechazo: reason,
          version: { increment: 1 },
        },
      });

      if (changed.count !== 1) {
        throw new PaymentConcurrentModificationError({ pagoId: input.pagoId });
      }

      await tx.pagoEvento.create({
        data: {
          pagoId: input.pagoId,
          usuarioId: input.actorId,
          tipo: 'RECHAZADO',
          estado: 'RECHAZADO',
          detalle: reason,
          claveIdempotencia: input.claveIdempotencia,
        },
      });

      const row = await tx.pago.findUniqueOrThrow({ where: { id: input.pagoId } });
      return mapPayment(row);
    });
  }

  apply(input: Parameters<PaymentWorkflowPort['apply']>[0]) {
    return this.withSerializableRetry(async (tx) => {
      const repeated = await tx.pagoAplicacion.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
      });

      if (repeated) {
        if (
          repeated.pagoId !== input.pagoId ||
          repeated.cuentaPorCobrarId !== input.cuentaPorCobrarId ||
          repeated.monto.toFixed(2) !== PaymentMoney.from(input.monto).toString()
        ) {
          throw new PaymentIdempotencyConflictError({
            claveIdempotencia: input.claveIdempotencia,
          });
        }
        return mapApplication(repeated);
      }

      const payment = await tx.pago.findUnique({ where: { id: input.pagoId } });

      if (!payment) {
        throw new PaymentNotFoundError(input.pagoId);
      }

      if (payment.estado !== 'VERIFICADO') {
        throw new PaymentInvalidStateError(payment.estado, 'aplicar');
      }

      if (payment.version !== input.expectedVersion) {
        throw new PaymentConcurrentModificationError({ pagoId: input.pagoId });
      }

      const receivable = await tx.cuentaPorCobrar.findUnique({
        where: { id: input.cuentaPorCobrarId },
      });

      if (!receivable) {
        throw new PaymentValidationError('La cuenta por cobrar no existe.', {
          cuentaPorCobrarId: input.cuentaPorCobrarId,
        });
      }

      if (
        receivable.empresaId !== payment.empresaId ||
        receivable.clienteId !== payment.clienteId
      ) {
        throw new PaymentValidationError(
          'La cuenta por cobrar no pertenece a la empresa y cliente del pago.',
        );
      }

      if (
        payment.pedidoId !== null &&
        receivable.pedidoId !== payment.pedidoId
      ) {
        throw new PaymentValidationError(
          'El pago está asociado a un pedido distinto al de la cuenta por cobrar.',
        );
      }

      if (receivable.moneda.trim().toUpperCase() !== payment.moneda.trim().toUpperCase()) {
        throw new PaymentValidationError(
          'La moneda del pago no coincide con la cuenta por cobrar.',
        );
      }

      if (receivable.estado === 'ANULADA') {
        throw new PaymentInvalidStateError(receivable.estado, 'aplicar a');
      }

      const active = await tx.pagoAplicacion.aggregate({
        where: { pagoId: payment.id, estado: 'ACTIVA' },
        _sum: { monto: true },
      });

      const amount = PaymentMoney.from(input.monto);
      const applied = PaymentMoney.from(active._sum.monto?.toFixed(2) ?? '0.00');
      const available = PaymentMoney.from(payment.monto.toFixed(2)).subtract(applied);
      const balance = PaymentMoney.from(receivable.saldoPendiente.toFixed(2));

      if (amount.gt(available)) {
        throw new PaymentAvailableAmountExceededError({
          disponible: available.toString(),
          solicitado: amount.toString(),
        });
      }

      if (amount.gt(balance)) {
        throw new ReceivableBalanceExceededError({
          saldoPendiente: balance.toString(),
          solicitado: amount.toString(),
        });
      }

      const application = await tx.pagoAplicacion.create({
        data: {
          pagoId: payment.id,
          cuentaPorCobrarId: receivable.id,
          monto: amount.toString(),
          estado: 'ACTIVA',
          aplicadoPorId: input.actorId,
          claveIdempotencia: input.claveIdempotencia,
        },
      });

      const nextBalance = balance.subtract(amount);
      const nextState = deriveReceivableState(
        nextBalance,
        PaymentMoney.from(receivable.montoOriginal.toFixed(2)),
        receivable.fechaVencimiento,
      );

      const receivableChanged = await tx.cuentaPorCobrar.updateMany({
        where: {
          id: receivable.id,
          version: receivable.version,
        },
        data: {
          saldoPendiente: nextBalance.toString(),
          estado: nextState as any,
          version: { increment: 1 },
        },
      });

      if (receivableChanged.count !== 1) {
        throw new PaymentConcurrentModificationError({
          cuentaPorCobrarId: receivable.id,
        });
      }

      const paymentChanged = await tx.pago.updateMany({
        where: {
          id: payment.id,
          version: payment.version,
          estado: 'VERIFICADO',
        },
        data: { version: { increment: 1 } },
      });

      if (paymentChanged.count !== 1) {
        throw new PaymentConcurrentModificationError({ pagoId: payment.id });
      }

      await tx.pagoEvento.create({
        data: {
          pagoId: payment.id,
          usuarioId: input.actorId,
          tipo: 'APLICADO',
          estado: 'VERIFICADO',
          detalle:
            'Aplicación de ' +
            amount.toString() +
            ' a cuenta por cobrar #' +
            String(receivable.id) +
            '.',
          referenciaTipo: 'CUENTA_POR_COBRAR',
          referenciaId: receivable.id,
          claveIdempotencia: input.claveIdempotencia + ':EVENT',
          metadata: {
            aplicacionId: application.id,
            monto: amount.toString(),
          },
        },
      });

      if (receivable.pedidoId) {
        await this.syncOrderPaymentState(
          tx,
          receivable.pedidoId,
          input.actorId,
          payment.id,
        );
      }

      if (receivable.creditoId) {
        await this.syncCreditState(tx, receivable.creditoId);
      }

      return mapApplication(application);
    });
  }

  reverseApplication(input: Parameters<PaymentWorkflowPort['reverseApplication']>[0]) {
    return this.withSerializableRetry(async (tx) => {
      const repeated = await tx.pagoEvento.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
        select: { pagoId: true, tipo: true },
      });

      if (repeated) {
        if (
          repeated.pagoId !== input.pagoId ||
          repeated.tipo !== 'APLICACION_REVERTIDA'
        ) {
          throw new PaymentIdempotencyConflictError({
            claveIdempotencia: input.claveIdempotencia,
          });
        }

        const row = await tx.pagoAplicacion.findUnique({
          where: { id: input.aplicacionId },
        });

        if (!row || row.pagoId !== input.pagoId) {
          throw new PaymentIdempotencyConflictError({
            aplicacionId: input.aplicacionId,
          });
        }

        return mapApplication(row);
      }

      const application = await tx.pagoAplicacion.findUnique({
        where: { id: input.aplicacionId },
      });

      if (!application || application.pagoId !== input.pagoId) {
        throw new PaymentNotFoundError();
      }

      if (application.estado !== 'ACTIVA') {
        throw new PaymentInvalidStateError(application.estado, 'revertir');
      }

      const payment = await tx.pago.findUnique({ where: { id: input.pagoId } });

      if (!payment) {
        throw new PaymentNotFoundError(input.pagoId);
      }

      if (payment.estado !== 'VERIFICADO') {
        throw new PaymentInvalidStateError(payment.estado, 'revertir aplicaciones de');
      }

      const receivable = await tx.cuentaPorCobrar.findUniqueOrThrow({
        where: { id: application.cuentaPorCobrarId },
      });

      const reason = requireReason(input.motivo);
      const amount = PaymentMoney.from(application.monto.toFixed(2));
      const balance = PaymentMoney.from(receivable.saldoPendiente.toFixed(2));
      const original = PaymentMoney.from(receivable.montoOriginal.toFixed(2));
      const restored = balance.add(amount);

      if (restored.gt(original)) {
        throw new PaymentValidationError(
          'La reversión produciría un saldo mayor al monto original de la cuenta por cobrar.',
        );
      }

      const updatedApplication = await tx.pagoAplicacion.update({
        where: { id: application.id },
        data: {
          estado: 'REVERSADA',
          revertidaEn: new Date(),
          revertidaPorId: input.actorId,
          motivoReversion: reason,
          version: { increment: 1 },
        },
      });

      const receivableChanged = await tx.cuentaPorCobrar.updateMany({
        where: {
          id: receivable.id,
          version: receivable.version,
        },
        data: {
          saldoPendiente: restored.toString(),
          estado: deriveReceivableState(
            restored,
            original,
            receivable.fechaVencimiento,
          ) as any,
          version: { increment: 1 },
        },
      });

      if (receivableChanged.count !== 1) {
        throw new PaymentConcurrentModificationError({
          cuentaPorCobrarId: receivable.id,
        });
      }

      const paymentChanged = await tx.pago.updateMany({
        where: {
          id: payment.id,
          version: payment.version,
          estado: 'VERIFICADO',
        },
        data: { version: { increment: 1 } },
      });

      if (paymentChanged.count !== 1) {
        throw new PaymentConcurrentModificationError({
          pagoId: payment.id,
        });
      }

      await tx.pagoEvento.create({
        data: {
          pagoId: payment.id,
          usuarioId: input.actorId,
          tipo: 'APLICACION_REVERTIDA',
          estado: 'VERIFICADO',
          detalle: reason,
          referenciaTipo: 'PAGO_APLICACION',
          referenciaId: application.id,
          claveIdempotencia: input.claveIdempotencia,
          metadata: {
            monto: amount.toString(),
            cuentaPorCobrarId: receivable.id,
          },
        },
      });

      if (receivable.pedidoId) {
        await this.syncOrderPaymentState(
          tx,
          receivable.pedidoId,
          input.actorId,
          payment.id,
        );
      }

      if (receivable.creditoId) {
        await this.syncCreditState(tx, receivable.creditoId);
      }

      return mapApplication(updatedApplication);
    });
  }

  void(input: Parameters<PaymentWorkflowPort['void']>[0]) {
    return this.withSerializableRetry(async (tx) => {
      const repeated = await tx.pagoEvento.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
        select: { pagoId: true, tipo: true },
      });

      if (repeated) {
        if (repeated.pagoId !== input.pagoId || repeated.tipo !== 'ANULADO') {
          throw new PaymentIdempotencyConflictError({
            claveIdempotencia: input.claveIdempotencia,
          });
        }

        const row = await tx.pago.findUniqueOrThrow({ where: { id: input.pagoId } });
        return mapPayment(row);
      }

      const payment = await tx.pago.findUnique({
        where: { id: input.pagoId },
      });

      if (!payment) {
        throw new PaymentNotFoundError(input.pagoId);
      }

      if (payment.estado !== 'VERIFICADO') {
        throw new PaymentInvalidStateError(payment.estado, 'anular');
      }

      if (payment.version !== input.expectedVersion) {
        throw new PaymentConcurrentModificationError({ pagoId: input.pagoId });
      }

      const reason = requireReason(input.motivo);
      const applications = await tx.pagoAplicacion.findMany({
        where: { pagoId: payment.id, estado: 'ACTIVA' },
        orderBy: { id: 'asc' },
      });

      const creditIds = new Set<number>();
      const orderIds = new Set<number>();

      for (const application of applications) {
        const receivable = await tx.cuentaPorCobrar.findUniqueOrThrow({
          where: { id: application.cuentaPorCobrarId },
        });

        const amount = PaymentMoney.from(application.monto.toFixed(2));
        const balance = PaymentMoney.from(receivable.saldoPendiente.toFixed(2));
        const original = PaymentMoney.from(receivable.montoOriginal.toFixed(2));
        const restored = balance.add(amount);

        if (restored.gt(original)) {
          throw new PaymentValidationError(
            'La anulación produciría un saldo mayor al monto original de la cuenta por cobrar.',
            { cuentaPorCobrarId: receivable.id },
          );
        }

        await tx.pagoAplicacion.update({
          where: { id: application.id },
          data: {
            estado: 'REVERSADA',
            revertidaEn: input.at,
            revertidaPorId: input.actorId,
            motivoReversion: 'Anulación del pago: ' + reason,
            version: { increment: 1 },
          },
        });

        const receivableChanged = await tx.cuentaPorCobrar.updateMany({
          where: {
            id: receivable.id,
            version: receivable.version,
          },
          data: {
            saldoPendiente: restored.toString(),
            estado: deriveReceivableState(
              restored,
              original,
              receivable.fechaVencimiento,
            ) as any,
            version: { increment: 1 },
          },
        });

        if (receivableChanged.count !== 1) {
          throw new PaymentConcurrentModificationError({
            cuentaPorCobrarId: receivable.id,
          });
        }

        await tx.pagoEvento.create({
          data: {
            pagoId: payment.id,
            usuarioId: input.actorId,
            tipo: 'APLICACION_REVERTIDA',
            estado: 'VERIFICADO',
            detalle: 'Reversión automática por anulación del pago.',
            referenciaTipo: 'PAGO_APLICACION',
            referenciaId: application.id,
            claveIdempotencia:
              input.claveIdempotencia + ':APP:' + String(application.id),
          },
        });

        if (receivable.pedidoId) {
          orderIds.add(receivable.pedidoId);
        }

        if (receivable.creditoId) {
          creditIds.add(receivable.creditoId);
        }
      }

      const changed = await tx.pago.updateMany({
        where: {
          id: payment.id,
          version: payment.version,
          estado: 'VERIFICADO',
        },
        data: {
          estado: 'ANULADO',
          anuladoPorId: input.actorId,
          anuladoEn: input.at,
          motivoAnulacion: reason,
          version: { increment: 1 },
        },
      });

      if (changed.count !== 1) {
        throw new PaymentConcurrentModificationError({ pagoId: payment.id });
      }

      await tx.pagoEvento.create({
        data: {
          pagoId: payment.id,
          usuarioId: input.actorId,
          tipo: 'ANULADO',
          estado: 'ANULADO',
          detalle: reason,
          claveIdempotencia: input.claveIdempotencia,
        },
      });

      if (payment.pedidoId) {
        orderIds.add(payment.pedidoId);
      }

      for (const orderId of orderIds) {
        await this.syncOrderPaymentState(
          tx,
          orderId,
          input.actorId,
          payment.id,
        );
      }

      for (const creditId of creditIds) {
        await this.syncCreditState(tx, creditId);
      }

      const row = await tx.pago.findUniqueOrThrow({ where: { id: payment.id } });
      return mapPayment(row);
    });
  }

  private async syncOrderPaymentState(
    tx: any,
    pedidoId: number,
    actorId: number,
    pagoId: number,
  ): Promise<void> {
    const order = await tx.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        total: true,
        estadoPago: true,
      },
    });

    if (!order) {
      return;
    }

    const [directAggregate, generalAggregate] = await Promise.all([
      tx.pago.aggregate({
        where: {
          pedidoId,
          estado: 'VERIFICADO',
        },
        _sum: { monto: true },
      }),
      tx.pagoAplicacion.aggregate({
        where: {
          estado: 'ACTIVA',
          cuentaPorCobrar: { pedidoId },
          pago: {
            estado: 'VERIFICADO',
            pedidoId: null,
          },
        },
        _sum: { monto: true },
      }),
    ]);

    const total = PaymentMoney.from(order.total.toFixed(2));
    const direct = PaymentMoney.from(
      directAggregate._sum.monto?.toFixed(2) ?? '0.00',
    );
    const generalApplied = PaymentMoney.from(
      generalAggregate._sum.monto?.toFixed(2) ?? '0.00',
    );
    const paid = direct.add(generalApplied);

    let nextState: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' = 'PENDIENTE';

    if (total.isPositive() && paid.gte(total)) {
      nextState = 'PAGADO';
    } else if (paid.isPositive()) {
      nextState = 'PARCIAL';
    }

    if (order.estadoPago === nextState) {
      return;
    }

    await tx.pedido.update({
      where: { id: order.id },
      data: {
        estadoPago: nextState,
        version: { increment: 1 },
      },
    });

    await tx.pedidoEvento.create({
      data: {
        pedidoId: order.id,
        usuarioId: actorId,
        tipo: 'OBSERVACION',
        detalle:
          'Estado de pago actualizado a ' +
          nextState +
          '. Total reconocido: ' +
          paid.toString() +
          '.',
        referenciaTipo: 'PAGO',
        referenciaId: pagoId,
      },
    });
  }

  private async syncCreditState(tx: any, creditoId: number): Promise<void> {
    const credit = await tx.credito.findUnique({
      where: { id: creditoId },
      select: { id: true, estado: true },
    });

    if (!credit) {
      return;
    }

    const receivables = await tx.cuentaPorCobrar.findMany({
      where: {
        creditoId,
        estado: { not: 'ANULADA' },
      },
      select: { saldoPendiente: true },
    });

    if (!receivables.length) {
      return;
    }

    const allPaid = receivables.every((row: any) =>
      PaymentMoney.from(row.saldoPendiente.toFixed(2)).isZero(),
    );

    const nextState = allPaid ? 'CERRADO' : 'ACTIVO';

    if (credit.estado === nextState) {
      return;
    }

    await tx.credito.update({
      where: { id: credit.id },
      data: {
        estado: nextState,
        cerradoEn: allPaid ? new Date() : null,
        version: { increment: 1 },
      },
    });
  }

  private async withSerializableRetry<T>(
    work: (tx: any) => Promise<T>,
    attempts = 3,
  ): Promise<T> {
    let last: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => work(tx),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        last = error;

        const retryable =
          error instanceof PaymentConcurrentModificationError ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            ['P2034', 'P2002'].includes(error.code));

        if (!retryable || attempt === attempts) {
          throw error;
        }
      }
    }

    throw last;
  }
}

function mapPayment(row: any): PaymentSnapshot {
  return {
    id: row.id,
    empresaId: row.empresaId,
    clienteId: row.clienteId,
    pedidoId: row.pedidoId,
    bancoId: row.bancoId,
    registradoPorId: row.registradoPorId,
    verificadoPorId: row.verificadoPorId,
    rechazadoPorId: row.rechazadoPorId,
    anuladoPorId: row.anuladoPorId,
    metodo: row.metodo,
    estado: row.estado,
    moneda: row.moneda,
    monto: row.monto.toFixed(2),
    referencia: row.referencia,
    fechaPago: row.fechaPago,
    verificadoEn: row.verificadoEn,
    rechazadoEn: row.rechazadoEn,
    motivoRechazo: row.motivoRechazo,
    anuladoEn: row.anuladoEn,
    motivoAnulacion: row.motivoAnulacion,
    observaciones: row.observaciones,
    claveIdempotencia: row.claveIdempotencia,
    version: row.version,
  };
}

function mapApplication(row: any): PaymentApplicationSnapshot {
  return {
    id: row.id,
    pagoId: row.pagoId,
    cuentaPorCobrarId: row.cuentaPorCobrarId,
    monto: row.monto.toFixed(2),
    estado: row.estado,
    aplicadoPorId: row.aplicadoPorId,
    revertidaEn: row.revertidaEn,
    revertidaPorId: row.revertidaPorId,
    motivoReversion: row.motivoReversion,
    claveIdempotencia: row.claveIdempotencia,
    version: row.version,
  };
}

function deriveReceivableState(
  balance: PaymentMoney,
  original: PaymentMoney,
  dueDate: Date,
): 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA' {
  if (balance.isZero()) {
    return 'PAGADA';
  }

  if (dueDate.getTime() < Date.now()) {
    return 'VENCIDA';
  }

  if (original.gt(balance)) {
    return 'PARCIAL';
  }

  return 'PENDIENTE';
}

function requireReason(value: string): string {
  const normalized = value.trim();

  if (normalized.length < 3) {
    throw new PaymentValidationError(
      'El motivo debe contener al menos 3 caracteres.',
    );
  }

  return normalized;
}
