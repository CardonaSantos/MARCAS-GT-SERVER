import { Prisma } from '@prisma/client';
import { PaymentWorkflowPrismaAdapter } from './payment-workflow.prisma-adapter';

describe('PaymentWorkflowPrismaAdapter: un único anticipo por pedido MIXTO', () => {
  const input = {
    empresaId: 1, clienteId: 2, pedidoId: 7, bancoId: null,
    registradoPorId: 9, metodo: 'EFECTIVO' as const, moneda: 'GTQ',
    monto: '400.00', referencia: null, fechaPago: new Date('2026-10-09T10:00:00Z'),
    observaciones: null, claveIdempotencia: 'ADVANCE-REGISTER-7-A',
    concepto: 'ANTICIPO' as const,
  };
  function setup(opts: { state?: string; balance?: string; existingId?: number; plan?: string } = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      pago: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(
          opts.existingId ? { id: opts.existingId } : null,
        ),
        create: jest.fn(),
      },
      pedido: { findUnique: jest.fn().mockResolvedValue({ condicionPago: 'MIXTO' }) },
      creditoPlanPago: { findFirst: jest.fn().mockResolvedValue(
        opts.plan ? { estado: opts.plan } : { estado: 'BORRADOR' },
      ) },
      cuentaPorCobrar: { findUnique: jest.fn().mockResolvedValue({
        estado: opts.state ?? 'PENDIENTE', empresaId: 1, clienteId: 2, moneda: 'GTQ',
        montoOriginal: new Prisma.Decimal('400.00'),
        saldoPendiente: new Prisma.Decimal(opts.balance ?? '400.00'),
      }) },
    };
    const prisma = { $transaction: jest.fn().mockImplementation(
      async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    ) };
    return { repo: new PaymentWorkflowPrismaAdapter(prisma as any), tx };
  }

  it('rechaza repetir un anticipo cuando otro pago aún está pendiente', async () => {
    const { repo, tx } = setup({ existingId: 3 });
    await expect(repo.register(input)).rejects.toThrow(/Ya existe un pago de anticipo/);
    expect(tx.pago.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rechaza otro anticipo si el primero ya está pagado y aplicado', async () => {
    const { repo, tx } = setup({ state: 'PAGADA', balance: '0.00' });
    await expect(repo.register(input)).rejects.toThrow(/anticipo vinculado y pagado/);
    expect(tx.pago.create).not.toHaveBeenCalled();
  });

  it('rechaza monto distinto al anticipo autorizado', async () => {
    const { repo } = setup();
    await expect(repo.register({ ...input, monto: '450.00' }))
      .rejects.toThrow(/coincidir con el monto autorizado/);
  });

  it('no acepta un segundo anticipo una vez activado el plan', async () => {
    const { repo, tx } = setup({ plan: 'ACTIVO' });
    await expect(repo.register(input)).rejects.toThrow(/anticipo ya fue cerrado/);
    expect(tx.pago.create).not.toHaveBeenCalled();
  });

  it('bloquea el cobro de cuotas antes de activar el plan', async () => {
    const { repo } = setup();
    await expect(repo.register({ ...input, concepto: 'CUOTA' }))
      .rejects.toThrow(/Primero activa el plan/);
  });
});
