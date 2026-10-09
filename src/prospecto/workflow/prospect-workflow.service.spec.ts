import { ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ProspectWorkflowService } from './prospect-workflow.service';

describe('ProspectWorkflowService.start advisory lock', () => {
  const calls: string[] = [];
  const tx = {
    $queryRaw: jest.fn(),
    prospecto: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    usuario: { findUnique: jest.fn() },
    municipio: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const service = new ProspectWorkflowService(prisma as unknown as PrismaService);
  const dto = {
    nombreCompleto: 'Cliente en visita',
    departamentoId: 13,
    municipioId: 21,
  };
  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
    prisma.usuario.findUnique.mockResolvedValue({ id: 2, rol: 'ADMIN', activo: true });
    prisma.municipio.findUnique.mockResolvedValue({ departamentoId: 13 });
    tx.$queryRaw.mockImplementation(async (...sql: unknown[]) => {
      const template = sql[0] as TemplateStringsArray;
      const query = Array.from(template).join('?');
      expect(query).toMatch(/pg_advisory_xact_lock\(/);
      expect(query).toMatch(/IS NULL AS lock_evaluated/);
      expect(query).not.toMatch(/SELECT\s+pg_advisory_xact_lock\([^)]*\)\s*$/);
      expect(sql[1]).toBe(2);
      calls.push('lock');
      return [{ lock_evaluated: false }];
    });
    tx.prospecto.findFirst.mockImplementation(async () => {
      calls.push('find');
      return null;
    });
    tx.prospecto.create.mockImplementation(async () => {
      calls.push('create');
      return { id: 9, usuarioId: 2, estado: 'EN_PROSPECTO' };
    });
  });

  it('obtiene el bloqueo tipado antes de comprobar y crear el prospecto', async () => {
    await expect(service.start(2, dto)).resolves.toMatchObject({
      id: 9, usuarioId: 2, estado: 'EN_PROSPECTO',
    });
    expect(calls).toEqual(['lock', 'find', 'create']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rechaza un segundo prospecto manteniendo el bloqueo en la transacción', async () => {
    tx.prospecto.findFirst.mockImplementationOnce(async () => {
      calls.push('find');
      return { id: 99 };
    });
    await expect(service.start(2, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toEqual(['lock', 'find']);
    expect(tx.prospecto.create).not.toHaveBeenCalled();
  });

  it('rechaza al actor antes de iniciar la transacción cuando está inactivo', async () => {
    prisma.usuario.findUnique.mockResolvedValueOnce({ id: 2, rol: 'ADMIN', activo: false });
    await expect(service.start(2, dto)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
