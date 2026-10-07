import { PaymentBankCommands } from './payment-bank.commands';

describe('PaymentBankCommands', () => {
  const operator = {
    id: 10,
    nombre: 'Contabilidad',
    correo: 'conta@test.local',
    rol: 'CONTABILIDAD',
    activo: true,
    empresaId: 3,
  } as any;

  const actors = {
    findById: jest.fn(async () => operator),
  } as any;

  const snapshot = {
    id: 4,
    empresaId: 3,
    nombre: 'Banco Industrial',
    codigo: 'BI',
    cuenta: '001-001',
    activo: true,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
  };

  function repository() {
    return {
      create: jest.fn(async () => snapshot),
      update: jest.fn(async () => snapshot),
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea un banco para la empresa del operador', async () => {
    const repo = repository();
    const useCase = new PaymentBankCommands(repo, actors);

    await useCase.create({
      actorId: operator.id,
      nombre: ' Banco Industrial ',
      codigo: ' BI ',
      cuenta: ' 001-001 ',
    });

    expect(repo.create).toHaveBeenCalledWith({
      empresaId: 3,
      nombre: 'Banco Industrial',
      codigo: 'BI',
      cuenta: '001-001',
      activo: true,
    });
  });

  it('permite activar o desactivar un banco existente', async () => {
    const repo = repository();
    const useCase = new PaymentBankCommands(repo, actors);

    await useCase.update({
      id: 4,
      actorId: operator.id,
      activo: false,
    });

    expect(repo.update).toHaveBeenCalledWith({
      id: 4,
      empresaId: 3,
      activo: false,
    });
  });

  it('impide administrar bancos a un vendedor', async () => {
    actors.findById.mockResolvedValueOnce({
      ...operator,
      rol: 'VENDEDOR',
    });
    const repo = repository();
    const useCase = new PaymentBankCommands(repo, actors);

    await expect(
      useCase.create({
        actorId: operator.id,
        nombre: 'Banco Test',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_FORBIDDEN' });

    expect(repo.create).not.toHaveBeenCalled();
  });
});
