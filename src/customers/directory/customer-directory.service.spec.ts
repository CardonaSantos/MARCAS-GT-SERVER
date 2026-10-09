import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CustomerDirectoryService } from './customer-directory.service';
import { CustomerDirectoryQueryDto } from './customer-directory-query.dto';

describe('CustomerDirectoryService', () => {
  const cliente = { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() };
  const prisma = {
    cliente,
    $transaction: jest.fn(async (values: Array<Promise<unknown>>) => Promise.all(values)),
  };
  const service = new CustomerDirectoryService(prisma as unknown as PrismaService);
  const now = new Date('2026-10-08T10:00:00Z');
  const row = {
    id: 7, nombre: 'Ana', apellido: 'Maria', correo: 'a@example.test',
    telefono: '55555555', direccion: 'Centro', tipoCliente: 'Boutique',
    categoriasInteres: ['Ropa de Mujer'], volumenCompra: 'medio',
    presupuestoMensual: '5000-10000', preferenciaContacto: 'whatsapp',
    departamentoId: 2, municipioId: 3, creadoEn: now, actualizadoEn: now,
    departamento: { id: 2, nombre: 'Huehuetenango' },
    municipio: { id: 3, nombre: 'Jacaltenango', departamentoId: 2 },
    ubicacion: { latitud: 15.66, longitud: -91.71 },
    _count: { ventas: 5, pedidos: 2, visitas: 3, solicitudesCredito: 1, entregas: 1 },
  };
  beforeEach(() => {
    jest.clearAllMocks();
    cliente.count.mockResolvedValue(1);
    cliente.findMany.mockResolvedValue([row]);
    cliente.findUnique.mockResolvedValue({ ...row, comentarios: 'Notas', perfilFiscal: null });
  });
  it('filters name words, interests and departments server-side, paginates and counts only', async () => {
    const query = {
      page: 2, limit: 10, search: 'Ana Maria', departamentoId: 2,
      municipioId: 3, intereses: 'Ropa de Mujer,Ropa de Hombre',
      sortBy: 'nombre', sortDir: 'asc',
    } as CustomerDirectoryQueryDto;
    const result = await service.list(query);
    expect(result.meta).toEqual({ total: 1, page: 2, limit: 10, totalPages: 1 });
    expect(result.data[0].actividad).toEqual({
      ventas: 5, pedidos: 2, visitas: 3, solicitudesCredito: 1, entregas: 1,
    });
    expect(cliente.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10, take: 10,
      where: expect.objectContaining({
        departamentoId: 2, municipioId: 3,
        categoriasInteres: { hasSome: ['Ropa de Mujer', 'Ropa de Hombre'] },
        AND: expect.arrayContaining([
          { OR: expect.arrayContaining([{ nombre: { contains: 'Ana', mode: 'insensitive' } }]) },
        ]),
      }),
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    }));
    const args = cliente.findMany.mock.calls[0][0];
    expect(args.select.ventas).toBeUndefined();
    expect(args.select._count.select.ventas).toBe(true);
  });
  it('returns empty paginated results without throwing', async () => {
    cliente.count.mockResolvedValue(0);
    cliente.findMany.mockResolvedValue([]);
    const result = await service.list({
      page: 1, limit: 20, sortBy: 'nombre', sortDir: 'asc',
    });
    expect(result).toEqual({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  });
  it('returns full detail including geo and notes', async () => {
    const result = await service.detail(7);
    expect(result).toMatchObject({
      id: 7, comentarios: 'Notas',
      ubicacion: { latitud: 15.66, longitud: -91.71 },
      actividad: { ventas: 5 },
    });
  });
  it('returns 404 when customer does not exist', async () => {
    cliente.findUnique.mockResolvedValue(null);
    await expect(service.detail(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
