import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { VisitWorkflowService } from './visit-workflow.service';

describe('VisitWorkflowService', () => {
  const usuario = { findUnique: jest.fn() };
  const visita = { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() };
  const cliente = { findUnique: jest.fn() };
  const notifications = { createNotification: jest.fn() };
  const calls: string[] = [];
  const tx = {
    visita, cliente,
    $queryRaw: jest.fn(async (...args: unknown[]) => {
      const strings = args[0] as TemplateStringsArray;
      expect(Array.from(strings).join('?')).toMatch(/pg_advisory_xact_lock\(.+IS NULL AS locked/);
      expect(args[1]).toBe(2);
      calls.push('lock');
      return [{ locked: false }];
    }),
  };
  const prisma = {
    usuario,
    visita,
    $transaction: jest.fn(async (cb: (transaction: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const service = new VisitWorkflowService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  const selection = { clienteId: 15, motivoVisita: 'SEGUIMIENTO' as const, tipoVisita: 'PRESENCIAL' as const };
  const record = { id: 3, usuarioId: 2, clienteId: 15, cliente: { nombre: 'Rosa' } };
  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({ id: 2, nombre: 'Vendedor', rol: 'ADMIN', activo: true });
    visita.findFirst.mockImplementation(async () => { calls.push('find'); return null; });
    cliente.findUnique.mockImplementation(async () => { calls.push('customer'); return { id: 15, nombre: 'Rosa' }; });
    visita.create.mockImplementation(async () => { calls.push('create'); return record; });
    visita.updateMany.mockResolvedValue({ count: 1 });
    visita.findUniqueOrThrow.mockResolvedValue(record);
  });
  it('starts a visit under a transaction lock using only the session actor', async () => {
    await expect(service.start(2, selection)).resolves.toEqual(record);
    expect(calls).toEqual(['lock', 'find', 'customer', 'create']);
    expect(visita.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ usuarioId: 2, clienteId: 15, estadoVisita: 'INICIADA' }),
    }));
  });
  it('rejects a second active visit', async () => {
    visita.findFirst.mockResolvedValueOnce({ id: 100 });
    await expect(service.start(2, selection)).rejects.toBeInstanceOf(ConflictException);
    expect(visita.create).not.toHaveBeenCalled();
  });
  it('only finishes own active visit once', async () => {
    await service.finish(2, 3, { observaciones: 'Visita completada' });
    expect(visita.updateMany).toHaveBeenCalledWith({
      where: { id: 3, usuarioId: 2, estadoVisita: 'INICIADA', fin: null },
      data: expect.objectContaining({ estadoVisita: 'FINALIZADA', observaciones: 'Visita completada' }),
    });
    visita.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.finish(2, 3, { observaciones: '' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('cancels with a mandatory reason and scoped update', async () => {
    await service.cancel(2, 3, { motivoCancelacion: 'Cliente ausente' });
    expect(visita.updateMany).toHaveBeenCalledWith({
      where: { id: 3, usuarioId: 2, estadoVisita: 'INICIADA', fin: null },
      data: expect.objectContaining({ estadoVisita: 'CANCELADA', observaciones: 'Cliente ausente' }),
    });
  });
  it('rejects role without visit permission', async () => {
    usuario.findUnique.mockResolvedValueOnce({ id: 2, rol: 'BODEGA', activo: true });
    await expect(service.open(2)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not undo saved visit when notifications fail', async () => {
    notifications.createNotification.mockRejectedValueOnce(new Error('Transport offline'));
    await expect(service.start(2, selection)).resolves.toEqual(record);
  });
});
