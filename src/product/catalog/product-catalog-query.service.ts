import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import { ProductCatalogListQueryDto } from './catalog-query.dto';
import {
  CatalogMovementSummary,
  CatalogProductView,
  CatalogWarehouseStock,
  ProductCatalogDetail,
  ProductCatalogPage,
} from './catalog.models';

const PRODUCT_SELECT = Prisma.validator<Prisma.ProductoSelect>()({
  id: true,
  nombre: true,
  codigoProducto: true,
  descripcion: true,
  precio: true,
  costo: true,
  creadoEn: true,
  actualizadoEn: true,
  categorias: {
    select: { categoria: { select: { id: true, nombre: true } } },
  },
  imagenes: {
    select: { id: true, url: true, creadoEn: true },
    orderBy: { creadoEn: 'asc' },
  },
  perfilFiscal: {
    select: {
      bienOServicio: true,
      unidadMedida: true,
      descripcionFiscal: true,
      activo: true,
    },
  },
  stock: { select: { cantidad: true, proveedorId: true } },
});

type CatalogProductRow = Prisma.ProductoGetPayload<{
  select: typeof PRODUCT_SELECT;
}>;

const STOCK_SELECT = Prisma.validator<Prisma.StockBodegaSelect>()({
  id: true,
  productoId: true,
  cantidadReal: true,
  cantidadReservada: true,
  cantidadDisponible: true,
  costoPromedio: true,
  actualizadoEn: true,
  bodega: {
    select: {
      id: true,
      codigo: true,
      nombre: true,
      esPrincipal: true,
      activo: true,
    },
  },
});
type StockRow = Prisma.StockBodegaGetPayload<{ select: typeof STOCK_SELECT }>;

const MOVEMENT_SELECT = Prisma.validator<Prisma.MovimientoInventarioSelect>()({
  id: true,
  tipo: true,
  cantidad: true,
  costoUnitario: true,
  creadoEn: true,
  referenciaTipo: true,
  referenciaId: true,
  bodega: { select: { id: true, nombre: true, codigo: true } },
  proveedor: { select: { id: true, nombre: true } },
});
type MovementRow = Prisma.MovimientoInventarioGetPayload<{
  select: typeof MOVEMENT_SELECT;
}>;

const INBOUND_TYPES = [
  'ENTRADA_RECEPCION',
  'AJUSTE_ENTRADA',
  'TRANSFERENCIA_ENTRADA',
  'DEVOLUCION',
  'MIGRACION_INICIAL',
] as const;

@Injectable()
export class ProductCatalogQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo con paginación y filtros DB-side; no depende de Stock legacy. */
  async list(
    query: ProductCatalogListQueryDto,
    empresaId: number,
  ): Promise<ProductCatalogPage> {
    if (query.precioMin != null && query.precioMax != null &&
        query.precioMin > query.precioMax) {
      throw new BadRequestException('precioMin no puede superar precioMax.');
    }

    if (query.bodegaId) {
      await this.assertWarehouseBelongsToCompany(query.bodegaId, empresaId);
    }

    const scopedStock: Prisma.StockBodegaWhereInput = {
      bodega: { empresaId },
      ...(query.bodegaId ? { bodegaId: query.bodegaId } : {}),
    };

    const where: Prisma.ProductoWhereInput = {
      ...(query.search ? {
        OR: [
          { nombre: { contains: query.search, mode: 'insensitive' } },
          { codigoProducto: { contains: query.search, mode: 'insensitive' } },
          { descripcion: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(query.categoriaId ? {
        categorias: { some: { categoriaId: query.categoriaId } },
      } : {}),
      ...(query.precioMin != null || query.precioMax != null ? {
        precio: {
          ...(query.precioMin != null ? { gte: query.precioMin } : {}),
          ...(query.precioMax != null ? { lte: query.precioMax } : {}),
        },
      } : {}),
      ...(query.conExistencia === true ? {
        stocksBodega: { some: { ...scopedStock, cantidadReal: { gt: 0 } } },
      } : query.conExistencia === false ? {
        stocksBodega: { none: { ...scopedStock, cantidadReal: { gt: 0 } } },
      } : query.bodegaId ? {
        stocksBodega: { some: scopedStock },
      } : {}),
    };

    // Tie-breaker: paginación determinista aun si dos productos tienen mismo nombre.
    const orderBy: Prisma.ProductoOrderByWithRelationInput[] = [
      { [query.sortBy]: query.sortDir },
      { id: 'asc' },
    ];

    const [total, products] = await this.prisma.$transaction([
      this.prisma.producto.count({ where }),
      this.prisma.producto.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy,
        select: PRODUCT_SELECT,
      }),
    ]);

    const stocks = await this.findStocks(
      products.map((row) => row.id),
      empresaId,
    );

    return {
      data: products.map((product) => this.mapProduct(product, stocks.get(product.id) ?? [])),
      meta: buildPageMeta(total, query.page, query.limit),
    };
  }

  async detail(productoId: number, empresaId: number): Promise<ProductCatalogDetail> {
    const product = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: PRODUCT_SELECT,
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');

    const [stocks, movements, inbound] = await Promise.all([
      this.findStocks([productoId], empresaId),
      this.prisma.movimientoInventario.findMany({
        where: { productoId, bodega: { empresaId } },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        take: 10,
        select: MOVEMENT_SELECT,
      }),
      this.prisma.movimientoInventario.findMany({
        where: {
          productoId,
          bodega: { empresaId },
          tipo: { in: [...INBOUND_TYPES] },
        },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        take: 10,
        select: MOVEMENT_SELECT,
      }),
    ]);

    return {
      ...this.mapProduct(product, stocks.get(productoId) ?? []),
      movimientosRecientes: movements.map((row) => this.mapMovement(row)),
      ingresosRecientes: inbound.map((row) => this.mapMovement(row)),
    };
  }

  private async assertWarehouseBelongsToCompany(bodegaId: number, empresaId: number) {
    const warehouse = await this.prisma.bodega.findFirst({
      where: { id: bodegaId, empresaId },
      select: { id: true },
    });
    if (!warehouse) throw new BadRequestException('Bodega no disponible para esta empresa.');
  }

  /** Un query de stock para todos los productos de la página; evita N+1. */
  private async findStocks(ids: number[], empresaId: number): Promise<Map<number, StockRow[]>> {
    const byProduct = new Map<number, StockRow[]>();
    if (!ids.length) return byProduct;

    const rows = await this.prisma.stockBodega.findMany({
      where: {
        productoId: { in: ids },
        bodega: { empresaId },
      },
      select: STOCK_SELECT,
    });
    for (const row of rows) {
      const current = byProduct.get(row.productoId) ?? [];
      current.push(row);
      byProduct.set(row.productoId, current);
    }
    return byProduct;
  }

  private mapProduct(product: CatalogProductRow, stockRows: StockRow[]): CatalogProductView {
    const bodegas: CatalogWarehouseStock[] = stockRows.map((stock) => ({
      stockId: stock.id,
      bodega: stock.bodega,
      real: stock.cantidadReal,
      reservado: stock.cantidadReservada,
      disponible: stock.cantidadDisponible,
      costoPromedio: stock.costoPromedio.toFixed(4),
      actualizadoEn: stock.actualizadoEn,
    })).sort((a, b) =>
      Number(b.bodega.esPrincipal) - Number(a.bodega.esPrincipal) ||
      a.bodega.nombre.localeCompare(b.bodega.nombre, 'es'),
    );

    const totales = bodegas.reduce(
      (sum, stock) => ({
        real: sum.real + stock.real,
        reservado: sum.reservado + stock.reservado,
        disponible: sum.disponible + stock.disponible,
      }),
      { real: 0, reservado: 0, disponible: 0 },
    );

    return {
      id: product.id,
      nombre: product.nombre,
      codigoProducto: product.codigoProducto,
      descripcion: product.descripcion,
      precio: product.precio,
      costoReferencia: product.costo,
      categorias: product.categorias.map(({ categoria }) => categoria),
      imagenes: product.imagenes.map(({ id, url }) => ({ id, url })),
      imagenPrincipal: product.imagenes[0]?.url ?? null,
      perfilFiscal: product.perfilFiscal,
      inventario: { fuente: 'STOCK_BODEGA', totales, bodegas },
      stockLegacy: product.stock ? {
        fuente: 'STOCK_LEGACY',
        cantidad: product.stock.cantidad,
        proveedorId: product.stock.proveedorId,
        diferenciaConInventarioReal: product.stock.cantidad - totales.real,
      } : null,
      creadoEn: product.creadoEn,
      actualizadoEn: product.actualizadoEn,
    };
  }

  private mapMovement(row: MovementRow): CatalogMovementSummary {
    return {
      id: row.id,
      tipo: row.tipo,
      cantidad: row.cantidad,
      creadoEn: row.creadoEn,
      costoUnitario: row.costoUnitario?.toFixed(4) ?? null,
      bodega: row.bodega,
      proveedor: row.proveedor,
      referencia: row.referenciaTipo && row.referenciaId != null
        ? { tipo: row.referenciaTipo, id: row.referenciaId }
        : null,
    };
  }
}
