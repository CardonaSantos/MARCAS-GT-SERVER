import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { ProductService } from './product.service';

describe('ProductService - selector de productos para pedidos', () => {
  const prisma = {
    usuario: { findUnique: jest.fn() },
    producto: { findMany: jest.fn() },
  };
  const service = new ProductService(
    prisma as unknown as PrismaService,
    {} as CloudinaryService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.usuario.findUnique.mockResolvedValue({ empresaId: 1 });
  });

  it('calcula disponibilidad únicamente desde bodegas activas de la empresa', async () => {
    prisma.producto.findMany.mockResolvedValue([{
      id: 15,
      codigoProducto: 'TEST-15',
      nombre: 'Producto de prueba',
      precio: 100,
      stock: { cantidad: 500 }, // Stock antiguo, no se debe sumar.
      ventas: [],
      entregas: [],
      imagenes: [],
      categorias: [],
      stocksBodega: [
        { cantidadReal: 20, cantidadReservada: 5, cantidadDisponible: 15,
          bodega: { id: 1, codigo: 'CENTRAL', nombre: 'Central', esPrincipal: true } },
        { cantidadReal: 9, cantidadReservada: 2, cantidadDisponible: 7,
          bodega: { id: 2, codigo: 'SUR', nombre: 'Sur', esPrincipal: false } },
      ],
    }]);

    const result = await service.findAllProductToInventary(42);

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: 42 }, select: { empresaId: true },
    });
    expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        stocksBodega: expect.objectContaining({
          where: { bodega: { empresaId: 1, activo: true } },
        }),
      }),
    }));
    expect(result[0].inventario).toEqual({
      fuente: 'STOCK_BODEGA',
      totales: { real: 29, reservado: 7, disponible: 22 },
      bodegas: [
        { id: 1, codigo: 'CENTRAL', nombre: 'Central', esPrincipal: true,
          real: 20, reservado: 5, disponible: 15 },
        { id: 2, codigo: 'SUR', nombre: 'Sur', esPrincipal: false,
          real: 9, reservado: 2, disponible: 7 },
      ],
    });
    expect(result[0].stock).toEqual({ cantidad: 500 });
  });

  it('presenta cero cuando un producto no tiene registro en StockBodega', async () => {
    prisma.producto.findMany.mockResolvedValue([{
      id: 30, nombre: 'Sin inventario', codigoProducto: 'SIN-30',
      precio: 50, stock: null, ventas: [], entregas: [],
      imagenes: [], categorias: [], stocksBodega: [],
    }]);
    const result = await service.findAllProductToInventary(42);
    expect(result[0].inventario.totales).toEqual({
      real: 0, reservado: 0, disponible: 0,
    });
    expect(result[0].inventario.bodegas).toEqual([]);
  });

  it('rechaza usuarios sin empresa y no consulta el catálogo', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ empresaId: null });
    await expect(service.findAllProductToInventary(42)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.producto.findMany).not.toHaveBeenCalled();
  });
});
