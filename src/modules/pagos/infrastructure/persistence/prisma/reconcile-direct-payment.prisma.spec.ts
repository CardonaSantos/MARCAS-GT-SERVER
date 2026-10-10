import { Prisma } from '@prisma/client';
import { reconcileVerifiedDirectPayment } from './reconcile-direct-payment.prisma';

describe('Conciliación de anticipos MIXTO', () => {
  const payment = {
    id: 17,
    empresaId: 3,
    clienteId: 5,
    pedidoId: 21,
    estado: 'VERIFICADO',
    moneda: 'GTQ',
    monto: new Prisma.Decimal('450.00'),
    pedido: { condicionPago: 'MIXTO' },
  };
  const receivable = {
    id: 29,
    empresaId: 3,
    clienteId: 5,
    pedidoId: 21,
    estado: 'PENDIENTE',
    montoOriginal: new Prisma.Decimal('200.00'),
    saldoPendiente: new Prisma.Decimal('200.00'),
    fechaVencimiento: new Date('2030-01-01T00:00:00Z'),
    version: 0,
  };
  function makeTransaction() {
    return {
      pago: {
        findUnique: jest.fn().mockResolvedValue(payment),
        update: jest.fn().mockResolvedValue({}),
      },
      cuentaPorCobrar: {
        findMany: jest.fn().mockResolvedValue([receivable]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pagoAplicacion: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { monto: null } }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 31 }),
      },
      pagoEvento: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it('solo consulta la CxC de anticipo y aplica como máximo el anticipo verificado', async () => {
    const tx = makeTransaction();
    const applied = await reconcileVerifiedDirectPayment(tx as any, payment.id, 8);

    expect(applied).toBe(1);
    expect(tx.cuentaPorCobrar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pedidoId: 21,
          creditoId: null,
          claveIdempotencia: 'credit-advance:order:21',
        }),
      }),
    );
    expect(tx.pagoAplicacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pagoId: 17,
        cuentaPorCobrarId: 29,
        monto: '200.00',
        estado: 'ACTIVA',
      }),
    });
    expect(tx.cuentaPorCobrar.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 29, version: 0 }),
      data: expect.objectContaining({ saldoPendiente: '0.00', estado: 'PAGADA' }),
    });
    expect(tx.pago.update).toHaveBeenCalledTimes(1);
  });

  it('no duplica aplicaciones previamente revertidas ni activas', async () => {
    const tx = makeTransaction();
    tx.pagoAplicacion.findUnique.mockResolvedValue({ id: 99 });
    const count = await reconcileVerifiedDirectPayment(tx as any, payment.id, 8);
    expect(count).toBe(0);
    expect(tx.pagoAplicacion.create).not.toHaveBeenCalled();
  });

  it('mantiene sin cambios el crédito puro cuando no tiene CxC de anticipo', async () => {
    const tx = makeTransaction();
    tx.pago.findUnique.mockResolvedValue({ ...payment, pedido: { condicionPago: 'CREDITO' } });
    expect(await reconcileVerifiedDirectPayment(tx as any, payment.id, 8)).toBe(0);
    expect(tx.cuentaPorCobrar.findMany).not.toHaveBeenCalled();
  });
});
