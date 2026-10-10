import { CreditPaymentPlanPrismaRepository } from './credit-payment-plan.prisma-repository';
import { CreditPaymentPlanNotFoundError, CreditValidationError } from '../../../domain/errors/credit.errors';
import { Prisma } from '@prisma/client';

describe('Crédito: activación independiente de entrega', () => {
  const credit = {
    id: 7, empresaId: 1, clienteId: 2, estado: 'ACTIVO', numero: 'CRE-000007',
    montoFinanciado: new Prisma.Decimal('2000.00'),
    anticipoRequerido: new Prisma.Decimal('400.00'),
    solicitudOrigen: {
      pedidoId: 21,
      pedido: { moneda: 'GTQ', estado: 'CONFIRMADO', condicionPago: 'MIXTO' },
    },
  };
  const input = {
    creditoId: 7, empresaId: 1, expectedVersion: 0, actorId: 3,
    claveIdempotencia: 'MANUAL-ACTIVATE-7',
  };
  function setup(advancePaid: boolean) {
    const tx = {
      credito: { findUnique: jest.fn().mockResolvedValue(credit) },
      cuentaPorCobrar: { findUnique: jest.fn().mockResolvedValue({
        empresaId: 1, clienteId: 2, pedidoId: 21,
        estado: advancePaid ? 'PAGADA' : 'PENDIENTE',
        montoOriginal: new Prisma.Decimal('400.00'),
        saldoPendiente: new Prisma.Decimal(advancePaid ? '0.00' : '400.00'),
      }) },
      creditoPlanPago: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const db = {
      creditoPlanPago: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => any) => fn(tx)),
    };
    return { repo: new CreditPaymentPlanPrismaRepository(db as any), tx };
  }

  it('llega a la validación del plan sin exigir pedido ENTREGADO', async () => {
    const { repo, tx } = setup(true);
    await expect(repo.activatePaymentPlan(input))
      .rejects.toBeInstanceOf(CreditPaymentPlanNotFoundError);
    expect(tx.creditoPlanPago.findUnique).toHaveBeenCalled();
  });

  it('mantiene el bloqueo financiero si el anticipo aún no está pagado', async () => {
    const { repo, tx } = setup(false);
    await expect(repo.activatePaymentPlan(input))
      .rejects.toBeInstanceOf(CreditValidationError);
    expect(tx.creditoPlanPago.findUnique).not.toHaveBeenCalled();
  });
});
