import { Prisma } from '@prisma/client';
import { CreditPlanAutoActivationService } from './credit-plan-auto-activation.service';

describe('Activación automática con anticipo MIXTO', () => {
  const draft = {
    creditoId: 11,
    empresaId: 3,
    version: 0,
    creadoPorId: 8,
    credito: { aprobadoPorId: 7, anticipoRequerido: new Prisma.Decimal('500.00') },
  };
  const makeService = (advance: any) => {
    const db = {
      creditoPlanPago: { findFirst: jest.fn().mockResolvedValue(draft) },
      cuentaPorCobrar: { findUnique: jest.fn().mockResolvedValue(advance) },
    };
    const plans = { activatePaymentPlan: jest.fn().mockResolvedValue({}) };
    return { service: new CreditPlanAutoActivationService(db as any, plans as any), db, plans };
  };

  it('no activa el plan cuando el anticipo todavía está pendiente', async () => {
    const { service, plans } = makeService({
      empresaId: 3,
      estado: 'PARCIAL',
      saldoPendiente: new Prisma.Decimal('100.00'),
    });
    expect(await service.activateForOrder(21, 3)).toBe(false);
    expect(plans.activatePaymentPlan).not.toHaveBeenCalled();
  });

  it('activa el plan después de que el anticipo queda pagado', async () => {
    const { service, plans, db } = makeService({
      empresaId: 3,
      estado: 'PAGADA',
      saldoPendiente: new Prisma.Decimal('0.00'),
    });
    expect(await service.activateForOrder(21, 3)).toBe(true);
    expect(db.cuentaPorCobrar.findUnique).toHaveBeenCalledWith({
      where: { claveIdempotencia: 'credit-advance:order:21' },
      select: { empresaId: true, estado: true, saldoPendiente: true },
    });
    expect(plans.activatePaymentPlan).toHaveBeenCalledWith(
      expect.objectContaining({ creditoId: 11, empresaId: 3 }),
    );
  });

  it('no consulta anticipo en créditos puros', async () => {
    const { service, db, plans } = makeService(null);
    db.creditoPlanPago.findFirst.mockResolvedValue({
      ...draft,
      credito: { aprobadoPorId: 7, anticipoRequerido: new Prisma.Decimal('0.00') },
    });
    expect(await service.activateForOrder(21, 3)).toBe(true);
    expect(db.cuentaPorCobrar.findUnique).not.toHaveBeenCalled();
    expect(plans.activatePaymentPlan).toHaveBeenCalledTimes(1);
  });
});
