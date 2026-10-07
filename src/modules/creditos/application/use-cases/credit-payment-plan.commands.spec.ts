import { CreditPaymentPlanCommands } from './credit-payment-plan.commands';

describe('CreditPaymentPlanCommands', () => {
  const actor = {
    id: 7,
    nombre: 'Conta',
    correo: 'conta@test.local',
    rol: 'CONTABILIDAD',
    activo: true,
    empresaId: 3,
  } as any;

  const users = {
    findById: jest.fn(async () => actor),
  } as any;

  const credit = {
    id: 11,
    empresaId: 3,
    clienteId: 5,
    numero: 'CRE-000011',
    estado: 'ACTIVO',
    montoFinanciado: '1000.00',
    pedidoId: 20,
    moneda: 'GTQ',
  };

  const plan = {
    id: 4,
    empresaId: 3,
    creditoId: 11,
    estado: 'BORRADOR',
    frecuencia: 'MENSUAL',
    montoProgramado: '1000.00',
    numeroCuotas: 2,
    primeraFechaVencimiento: new Date('2026-11-01T00:00:00.000Z'),
    version: 0,
    activadoEn: null,
    cuotas: [],
  } as any;

  function repository() {
    return {
      findCreditForPlan: jest.fn(async () => credit),
      createPaymentPlan: jest.fn(async () => plan),
      updatePaymentPlan: jest.fn(async () => plan),
      activatePaymentPlan: jest.fn(async () => ({ ...plan, estado: 'ACTIVO' })),
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea un borrador cuando las cuotas suman exactamente el monto financiado', async () => {
    const repo = repository();
    const useCase = new CreditPaymentPlanCommands(repo, users);

    await useCase.create({
      creditoId: 11,
      frecuencia: 'MENSUAL',
      cuotas: [
        {
          fechaVencimiento: new Date('2026-11-01T00:00:00.000Z'),
          montoProgramado: '400.00',
        },
        {
          fechaVencimiento: new Date('2026-12-01T00:00:00.000Z'),
          montoProgramado: '600',
        },
      ],
      claveIdempotencia: 'plan-create-11',
      actorId: actor.id,
    });

    expect(repo.createPaymentPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        creditoId: 11,
        empresaId: 3,
        frecuencia: 'MENSUAL',
        actorId: actor.id,
        cuotas: [
          expect.objectContaining({ numero: 1, montoProgramado: '400.00' }),
          expect.objectContaining({ numero: 2, montoProgramado: '600.00' }),
        ],
      }),
    );
  });

  it('rechaza un plan cuya suma no coincide con el monto financiado', async () => {
    const repo = repository();
    const useCase = new CreditPaymentPlanCommands(repo, users);

    await expect(
      useCase.create({
        creditoId: 11,
        frecuencia: 'MENSUAL',
        cuotas: [
          {
            fechaVencimiento: new Date('2026-11-01T00:00:00.000Z'),
            montoProgramado: '400.00',
          },
          {
            fechaVencimiento: new Date('2026-12-01T00:00:00.000Z'),
            montoProgramado: '500.00',
          },
        ],
        claveIdempotencia: 'plan-create-invalid',
        actorId: actor.id,
      }),
    ).rejects.toMatchObject({ code: 'CREDIT_VALIDATION_ERROR' });

    expect(repo.createPaymentPlan).not.toHaveBeenCalled();
  });

  it('impide gestionar planes a un vendedor', async () => {
    users.findById.mockResolvedValueOnce({
      ...actor,
      rol: 'VENDEDOR',
    });
    const repo = repository();
    const useCase = new CreditPaymentPlanCommands(repo, users);

    await expect(
      useCase.create({
        creditoId: 11,
        frecuencia: 'PERSONALIZADA',
        cuotas: [
          {
            fechaVencimiento: new Date('2026-11-01T00:00:00.000Z'),
            montoProgramado: '1000.00',
          },
        ],
        claveIdempotencia: 'plan-create-vendedor',
        actorId: actor.id,
      }),
    ).rejects.toMatchObject({ code: 'CREDIT_FORBIDDEN' });
  });

  it('delega la activación con control de versión', async () => {
    const repo = repository();
    const useCase = new CreditPaymentPlanCommands(repo, users);

    await useCase.activate({
      creditoId: 11,
      expectedVersion: 2,
      claveIdempotencia: 'plan-activate-11',
      actorId: actor.id,
    });

    expect(repo.activatePaymentPlan).toHaveBeenCalledWith({
      creditoId: 11,
      empresaId: 3,
      expectedVersion: 2,
      actorId: actor.id,
      claveIdempotencia: 'plan-activate-11',
    });
  });
});
