import { Prisma } from '@prisma/client';
import { PaymentMoney } from '../../../domain/value-objects/payment-money.vo';

/**
 * Conciliación de un pago de pedido NO financiado con una CxC real existente.
 *
 * Se ejecuta dentro de la misma transacción SERIALIZABLE que VERIFICAR.
 * Nunca crea cuentas por cobrar, no toca las cuotas de crédito y no atribuye
 * nuevos ingresos: la aplicación solo distribuye un pago ya verificado.
 */
export async function reconcileVerifiedDirectPayment(
  tx: Prisma.TransactionClient,
  pagoId: number,
  actorId: number,
): Promise<number> {
  const payment = await tx.pago.findUnique({
    where: { id: pagoId },
    include: { pedido: { select: { condicionPago: true } } },
  });
  if (
    !payment ||
    payment.estado !== 'VERIFICADO' ||
    !payment.pedidoId ||
    !['PREPAGO', 'CONTRAENTREGA'].includes(payment.pedido?.condicionPago ?? '')
  ) {
    return 0;
  }

  const receivables = await tx.cuentaPorCobrar.findMany({
    where: {
      empresaId: payment.empresaId,
      clienteId: payment.clienteId,
      pedidoId: payment.pedidoId,
      creditoId: null,
      moneda: payment.moneda,
      estado: { in: ['PENDIENTE', 'PARCIAL', 'VENCIDA'] },
      saldoPendiente: { gt: 0 },
    },
    orderBy: [{ fechaEmision: 'asc' }, { id: 'asc' }],
  });
  if (!receivables.length) return 0;

  const applied = await tx.pagoAplicacion.aggregate({
    where: { pagoId, estado: 'ACTIVA' },
    _sum: { monto: true },
  });
  let available = PaymentMoney.from(payment.monto.toFixed(2)).subtract(
    PaymentMoney.from(applied._sum.monto?.toFixed(2) ?? '0.00'),
  );
  let created = 0;

  for (const receivable of receivables) {
    if (!available.isPositive()) break;

    const key = 'direct-payment:' + pagoId + ':receivable:' + receivable.id;
    // Una aplicación revertida no se debe recrear silenciosamente.
    const existing = await tx.pagoAplicacion.findUnique({
      where: { claveIdempotencia: key },
      select: { id: true },
    });
    if (existing) continue;

    const balance = PaymentMoney.from(receivable.saldoPendiente.toFixed(2));
    const amount = available.gt(balance) ? balance : available;
    if (!amount.isPositive()) continue;

    const application = await tx.pagoAplicacion.create({
      data: {
        pagoId,
        cuentaPorCobrarId: receivable.id,
        monto: amount.toString(),
        estado: 'ACTIVA',
        aplicadoPorId: actorId,
        claveIdempotencia: key,
      },
    });
    const nextBalance = balance.subtract(amount);
    const original = PaymentMoney.from(receivable.montoOriginal.toFixed(2));
    const nextState = nextBalance.isZero()
      ? 'PAGADA'
      : receivable.fechaVencimiento.getTime() < Date.now()
        ? 'VENCIDA'
        : original.gt(nextBalance) ? 'PARCIAL' : 'PENDIENTE';

    const changed = await tx.cuentaPorCobrar.updateMany({
      where: {
        id: receivable.id,
        version: receivable.version,
        estado: { not: 'ANULADA' },
      },
      data: {
        saldoPendiente: nextBalance.toString(),
        estado: nextState,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new Error('Conflicto concurrente al conciliar una cuenta por cobrar.');
    }

    await tx.pagoEvento.create({
      data: {
        pagoId,
        usuarioId: actorId,
        tipo: 'APLICADO',
        estado: 'VERIFICADO',
        detalle: 'Conciliación automática de ' + amount.toString() +
          ' con CxC #' + receivable.id + ' del pedido.',
        referenciaTipo: 'CUENTA_POR_COBRAR',
        referenciaId: receivable.id,
        claveIdempotencia: key + ':EVENT',
        metadata: {
          origen: 'CONCILIACION_AUTOMATICA_PEDIDO',
          aplicacionId: application.id,
          monto: amount.toString(),
        },
      },
    });

    available = available.subtract(amount);
    created += 1;
  }

  if (created > 0) {
    await tx.pago.update({
      where: { id: pagoId },
      data: { version: { increment: 1 } },
    });
  }
  return created;
}
