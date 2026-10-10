import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { VisitHistoryService } from './visit-history.service';
import { VisitHistoryQueryDto } from './visit-history-query.dto';

describe('VisitHistoryService', () => {
  const usuario = { findUnique: jest.fn() };
  const visita = { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() };
  const prisma = { usuario, visita,
    $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const service = new VisitHistoryService(prisma as unknown as PrismaService);
  const start = new Date('2026-10-08T15:00:00.000Z');
  const row = {
    id: 4, inicio: start, fin: new Date(start.getTime() + 47 * 60000),
    clienteId: 9, usuarioId: 2, estadoVisita: 'FINALIZADA', motivoVisita: 'SEGUIMIENTO',
    tipoVisita: 'PRESENCIAL', observaciones: 'Revisión', creadoEn: start,
    actualizadoEn: start, cliente: { id: 9, nombre: 'Ana', apellido: 'Pérez' },
    vendedor: { id: 2, nombre: 'Vendedor' }, _count: { ventas: 3, pedidos: 1 },
  };
  const q: VisitHistoryQueryDto = {
    page: 2, limit: 10, sortBy: 'inicio', sortDir: 'desc',
    vendedorId: 50, estadoVisita: 'FINALIZADA', search: 'Ana',
    desde: '2026-10-01', hasta: '2026-10-08',
  } as VisitHistoryQueryDto;

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({ id: 2, activo: true, rol: 'VENDEDOR' });
    visita.count.mockResolvedValue(13);
    visita.findMany.mockResolvedValue([row]);
    visita.findFirst.mockResolvedValue(row);
  });
  it('paginates within the seller scope and computes actual elapsed time', async () => {
    const response = await service.list(2, q);
    expect(response.meta).toEqual({ page: 2, limit: 10, total: 13, totalPages: 2 });
    expect(response.data[0].duracionMinutos).toBe(47);
    expect(visita.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, take: 10, orderBy: [{ inicio: 'desc' }, { id: 'desc' }],
      where: expect.objectContaining({
        usuarioId: 2, estadoVisita: 'FINALIZADA',
        inicio: { gte: new Date('2026-10-01T00:00:00-06:00'),
          lt: new Date('2026-10-09T00:00:00-06:00') },
      }),
    }));
  });
  it('lets administrators filter a particular salesperson', async () => {
    usuario.findUnique.mockResolvedValueOnce({ id: 2, rol: 'ADMIN', activo: true });
    await service.list(2, q);
    expect(visita.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ usuarioId: 50 }),
    });
  });
  it('filters visits by client location without exposing other sellers', async () => {
    await service.list(2, { ...q, departamentoId: 13, municipioId: 6 });
    expect(visita.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        usuarioId: 2, cliente: { is: { departamentoId: 13, municipioId: 6 } },
      }),
    });
  });
  it('blocks unallowed roles', async () => {
    usuario.findUnique.mockResolvedValueOnce({ id: 2, rol: 'BODEGA', activo: true });
    await expect(service.list(2, q)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects inverted date bounds', async () => {
    await expect(service.list(2, { ...q, desde: '2026-10-09', hasta: '2026-10-08' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('returns one visit only within seller scope', async () => {
    const result = await service.detail(2, 4);
    expect(result.duracionMinutos).toBe(47);
    expect(visita.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 4, usuarioId: 2 },
    }));
    visita.findFirst.mockResolvedValueOnce(null);
    await expect(service.detail(2, 90)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('shows own active visit with no duration', async () => {
    visita.findFirst.mockResolvedValueOnce({ ...row, fin: null });
    const result = await service.detail(2, 4);
    expect(result.duracionMinutos).toBeNull();
  });
});
