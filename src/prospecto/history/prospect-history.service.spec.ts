import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ProspectHistoryService } from './prospect-history.service';
import { ProspectHistoryQueryDto } from './prospect-history-query.dto';

describe('ProspectHistoryService', () => {
  const usuario = { findUnique: jest.fn() };
  const prospecto = { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() };
  const cliente = { create: jest.fn(), update: jest.fn() };
  const ubicacionCliente = { create: jest.fn() };
  const prisma = {
    usuario, prospecto, cliente, ubicacionCliente,
    $transaction: jest.fn((arg: unknown) => Array.isArray(arg)
      ? Promise.all(arg)
      : (arg as (tx: unknown) => Promise<unknown>)({
        prospecto, cliente, ubicacionCliente,
      })),
  };
  const service = new ProspectHistoryService(prisma as unknown as PrismaService);
  const date = new Date('2026-10-08T10:00:00Z');
  const row = {
    id: 7, nombreCompleto: 'Ana', apellido: 'López', empresaTienda: 'Boutique',
    correo: 'ana@example.com', telefono: '55555555', direccion: 'Centro',
    estado: 'FINALIZADO', usuarioId: 2, clienteId: null,
    departamentoId: 13, municipioId: 72, tipoCliente: 'Boutique', inicio: date,
    fin: new Date('2026-10-08T10:40:00Z'), creadoEn: date, actualizadoEn: date,
    vendedor: { id: 2, nombre: 'Vendedor' }, departamento: null, municipio: null,
    categoriasInteres: [], volumenCompra: null, presupuestoMensual: null,
    preferenciaContacto: null, comentarios: null, ubicacion: null,
  };
  const query: ProspectHistoryQueryDto = {
    page: 2, limit: 10, sortBy: 'creadoEn', sortDir: 'desc',
    search: 'Ana López', estado: 'FINALIZADO',
    departamentoId: 13, vendedorId: 200,
  } as ProspectHistoryQueryDto;

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({ id: 2, rol: 'VENDEDOR', activo: true });
    prospecto.count.mockResolvedValue(1);
    prospecto.findMany.mockResolvedValue([row]);
    prospecto.findFirst.mockResolvedValue(row);
    prospecto.updateMany.mockResolvedValue({ count: 1 });
    cliente.create.mockResolvedValue({ id: 30, nombre: 'Ana', apellido: 'López' });
    cliente.update.mockResolvedValue({});
  });

  it('restricts seller searches to the current user, ignoring vendedorId', async () => {
    const result = await service.list(2, query);
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
    expect(result.data[0].duracionMinutos).toBe(40);
    expect(prospecto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, take: 10,
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      where: expect.objectContaining({
        usuarioId: 2, estado: 'FINALIZADO', departamentoId: 13,
        AND: expect.arrayContaining([
          { OR: expect.arrayContaining([{ nombreCompleto: { contains: 'Ana', mode: 'insensitive' } }]) },
        ]),
      }),
    }));
  });

  it('includes the complete selected end date in Guatemala time', async () => {
    await service.list(2, {
      ...query, page: 1, desde: '2026-10-01', hasta: '2026-10-08',
    });
    expect(prospecto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        creadoEn: {
          gte: new Date('2026-10-01T00:00:00-06:00'),
          lt: new Date('2026-10-09T00:00:00-06:00'),
        },
      }),
    }));
  });

  it('allows administrators to filter across vendors', async () => {
    usuario.findUnique.mockResolvedValue({ id: 2, rol: 'ADMIN', activo: true });
    await service.list(2, query);
    expect(prospecto.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ usuarioId: 200 }),
    });
  });

  it('rejects noncommercial roles', async () => {
    usuario.findUnique.mockResolvedValue({ id: 2, rol: 'REPARTIDOR', activo: true });
    await expect(service.list(2, query)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose other sellers prospect detail', async () => {
    prospecto.findFirst.mockResolvedValue(null);
    await expect(service.detail(2, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(prospecto.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7, usuarioId: 2 },
    }));
  });

  it('converts finalized prospects atomically without trusting form data', async () => {
    const result = await service.convertToCustomer(2, 7);
    expect(result).toEqual({
      prospectoId: 7, clienteId: 30,
      cliente: { id: 30, nombre: 'Ana', apellido: 'López' },
    });
    expect(cliente.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nombre: 'Ana', telefono: '55555555' }),
    });
    expect(prospecto.updateMany).toHaveBeenCalledWith({
      where: { id: 7, clienteId: null, estado: 'FINALIZADO', usuarioId: 2 },
      data: { clienteId: 30 },
    });
  });

  it('rejects a second conversion and rolls back', async () => {
    prospecto.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.convertToCustomer(2, 7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not convert cancelled or incomplete prospects', async () => {
    prospecto.findFirst.mockResolvedValue({ ...row, estado: 'CERRADO' });
    await expect(service.convertToCustomer(2, 7)).rejects.toBeInstanceOf(ConflictException);
    prospecto.findFirst.mockResolvedValue({ ...row, telefono: '' });
    await expect(service.convertToCustomer(2, 7)).rejects.toBeInstanceOf(BadRequestException);
    expect(cliente.create).not.toHaveBeenCalled();
  });
});
