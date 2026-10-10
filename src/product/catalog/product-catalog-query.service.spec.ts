import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { ProductCatalogListQueryDto } from './catalog-query.dto';
import { ProductCatalogQueryService } from './product-catalog-query.service';

describe('ProductCatalogQueryService', () => {
  const producto = {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  };
  const stockBodega = { findMany: jest.fn() };
  const bodega = { findFirst: jest.fn() };
  const movimientoInventario = { findMany: jest.fn() };
  const prisma = {
    producto,
    stockBodega,
    bodega,
    movimientoInventario,
    $transaction: jest.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const service = new ProductCatalogQueryService(prisma as unknown as PrismaService);
  const now = new Date('2026-10-08T10:00:00.000Z');
  const row = {
    id: 10,
    nombre: 'Camisa negra',
    codigoProducto: 'C-10',
    descripcion: null,
    precio: 120,
    costo: 65,
    creadoEn: now,
    actualizadoEn: now,
    categorias: [{ categoria: { id: 7, nombre: 'Camisas' } }],
    imagenes: [{ id: 25, url: 'https://example.test/image.png', creadoEn: now }],
    perfilFiscal: {
      bienOServicio: 'BIEN',
      unidadMedida: 'UN',
      descripcionFiscal: null,
      activo: true,
    },
    stock: { cantidad: 30, proveedorId: 4 },
  };
  const stocks = [{
    id: 101,
    productoId: 10,
    cantidadReal: 15,
    cantidadReservada: 5,
    cantidadDisponible: 10,
    costoPromedio: new Prisma.Decimal('60.5000'),
    actualizadoEn: now,
    bodega: {
      id: 3, codigo: 'CENTRAL', nombre: 'Bodega Central',
      esPrincipal: true, activo: true,
    },
  }, {
    id: 102,
    productoId: 10,
    cantidadReal: 8,
    cantidadReservada: 2,
    cantidadDisponible: 6,
    costoPromedio: new Prisma.Decimal('62.0000'),
    actualizadoEn: now,
    bodega: {
      id: 4, codigo: 'SUR', nombre: 'Bodega Sur',
      esPrincipal: false, activo: true,
    },
  }];

  beforeEach(() => {
    jest.clearAllMocks();
    producto.count.mockResolvedValue(1);
    producto.findMany.mockResolvedValue([row]);
    producto.findUnique.mockResolvedValue(row);
    stockBodega.findMany.mockResolvedValue(stocks);
    bodega.findFirst.mockResolvedValue({ id: 3 });
    movimientoInventario.findMany.mockResolvedValue([]);
  });

  it('pagina en PostgreSQL y muestra stock oficial por bodega sin sumarle Stock legacy', async () => {
    const query = {
      page: 1, limit: 20, sortBy: 'nombre', sortDir: 'asc',
      search: ' camisa ', categoriaId: 7, precioMin: 5, precioMax: 500,
      conExistencia: true,
    } as ProductCatalogListQueryDto;
    const result = await service.list(query, 9);

    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(result.data[0].inventario).toMatchObject({
      fuente: 'STOCK_BODEGA',
      totales: { real: 23, reservado: 7, disponible: 16 },
    });
    expect(result.data[0].inventario.bodegas).toHaveLength(2);
    expect(result.data[0].inventario.bodegas[0].costoPromedio).toBe('60.5000');
    expect(result.data[0].stockLegacy).toEqual({
      fuente: 'STOCK_LEGACY',
      cantidad: 30,
      proveedorId: 4,
      diferenciaConInventarioReal: 7,
    });
    expect(result.data[0].categorias).toEqual([{ id: 7, nombre: 'Camisas' }]);
    expect(result.data[0].imagenPrincipal).toBe('https://example.test/image.png');
    expect(producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0, take: 20,
      where: expect.objectContaining({
        categorias: { some: { categoriaId: 7 } },
        precio: { gte: 5, lte: 500 },
        stocksBodega: {
          some: { bodega: { empresaId: 9 }, cantidadReal: { gt: 0 } },
        },
      }),
    }));
    expect(stockBodega.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { productoId: { in: [10] }, bodega: { empresaId: 9 } },
    }));
  });

  it('valida bodega en la empresa e incluye stock global de esa empresa en la respuesta', async () => {
    await service.list({
      page: 2, limit: 5, sortBy: 'codigoProducto', sortDir: 'desc',
      bodegaId: 3,
    } as ProductCatalogListQueryDto, 9);

    expect(bodega.findFirst).toHaveBeenCalledWith({
      where: { id: 3, empresaId: 9 }, select: { id: true },
    });
    expect(producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 5, take: 5,
      where: { stocksBodega: {
        some: { bodega: { empresaId: 9 }, bodegaId: 3 },
      } },
    }));
  });

  it('conExistencia=false excluye stocks positivos en el ámbito empresarial', async () => {
    await service.list({
      page: 1, limit: 20, sortBy: 'nombre', sortDir: 'asc',
      conExistencia: false,
    } as ProductCatalogListQueryDto, 9);
    expect(producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { stocksBodega: {
        none: { bodega: { empresaId: 9 }, cantidadReal: { gt: 0 } },
      } },
    }));
  });

  it('rechaza precio invertido o bodega de otra empresa', async () => {
    await expect(service.list({
      page: 1, limit: 20,
      precioMin: 99, precioMax: 10,
    } as ProductCatalogListQueryDto, 9)).rejects.toBeInstanceOf(BadRequestException);
    bodega.findFirst.mockResolvedValueOnce(null);
    await expect(service.list({
      page: 1, limit: 20, bodegaId: 99,
    } as ProductCatalogListQueryDto, 9)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('omite consulta de stock al no encontrar filas en la página', async () => {
    producto.count.mockResolvedValue(0);
    producto.findMany.mockResolvedValue([]);
    const result = await service.list({
      page: 1, limit: 20, sortBy: 'nombre', sortDir: 'asc',
    } as ProductCatalogListQueryDto, 9);
    expect(result.data).toEqual([]);
    expect(result.meta.totalPages).toBe(0);
    expect(stockBodega.findMany).not.toHaveBeenCalled();
  });

  it('detalle incorpora ingresos, proveedores y movimientos con referencia', async () => {
    const movement = {
      id: 66, tipo: 'ENTRADA_RECEPCION', cantidad: 8,
      creadoEn: now, costoUnitario: new Prisma.Decimal('55.3400'),
      referenciaTipo: 'REQUISICION', referenciaId: 21,
      bodega: { id: 3, nombre: 'Bodega Central', codigo: 'CENTRAL' },
      proveedor: { id: 4, nombre: 'Proveedor ejemplo' },
    };
    movimientoInventario.findMany
      .mockResolvedValueOnce([movement])
      .mockResolvedValueOnce([movement]);
    const detail = await service.detail(10, 9);
    expect(detail.movimientosRecientes).toHaveLength(1);
    expect(detail.ingresosRecientes[0]).toMatchObject({
      proveedor: { id: 4, nombre: 'Proveedor ejemplo' },
      referencia: { tipo: 'REQUISICION', id: 21 },
      costoUnitario: '55.3400',
    });
    expect(movimientoInventario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productoId: 10, bodega: { empresaId: 9 } } }),
    );
  });

  it('devuelve 404 para producto inexistente', async () => {
    producto.findUnique.mockResolvedValueOnce(null);
    await expect(service.detail(999, 9)).rejects.toBeInstanceOf(NotFoundException);
  });
});
