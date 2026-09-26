import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import {
  InventoryListFilters,
  InventoryMovementFilters,
  InventoryReservationFilters,
  InventoryReservationView,
  InventoryStockListItemView,
} from '../../../application/models/inventory.models';
import { InventoryQueryPort } from '../../../application/ports/inventory-query.port';
import {
  InventoryMovementType,
  InventoryReservationState,
  InventoryUserRole,
} from '../../../domain/inventory.types';

const money4 = (value: Prisma.Decimal | string | number) =>
  new Prisma.Decimal(value).toFixed(4);
const money2 = (value: Prisma.Decimal | string | number) =>
  new Prisma.Decimal(value).toFixed(2);

@Injectable()
export class InventoryPrismaQueryAdapter implements InventoryQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: InventoryListFilters) {
    const where: Prisma.StockBodegaWhereInput = {
      ...(filters.bodegaId ? { bodegaId: filters.bodegaId } : {}),
      ...(filters.productoId ? { productoId: filters.productoId } : {}),
      ...(filters.conExistencia === true
        ? { cantidadReal: { gt: 0 } }
        : {}),
      ...(filters.conExistencia === false ? { cantidadReal: 0 } : {}),
      ...(filters.conReservas === true
        ? { cantidadReservada: { gt: 0 } }
        : {}),
      ...(filters.conReservas === false ? { cantidadReservada: 0 } : {}),
      ...(filters.search
        ? {
            OR: [
              {
                producto: {
                  nombre: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                producto: {
                  codigoProducto: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                bodega: {
                  nombre: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                bodega: {
                  codigo: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };

    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stockBodega.count({ where }),
      this.prisma.stockBodega.findMany({
        where,
        orderBy: this.stockOrderBy(filters.sortBy, filters.sortDir),
        skip,
        take: filters.limit,
        include: {
          producto: {
            select: {
              id: true,
              codigoProducto: true,
              nombre: true,
            },
          },
          bodega: {
            select: {
              id: true,
              codigo: true,
              nombre: true,
              esPrincipal: true,
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.stockListItem(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getStockDetail(stockId: number) {
    const row = await this.prisma.stockBodega.findUnique({
      where: { id: stockId },
      include: {
        producto: {
          select: {
            id: true,
            codigoProducto: true,
            nombre: true,
          },
        },
        bodega: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            esPrincipal: true,
          },
        },
        reservas: {
          where: {
            cantidadPendiente: { gt: 0 },
          },
          orderBy: {
            actualizadoEn: 'desc',
          },
          take: 20,
          include: {
            pedidoDetalle: {
              select: {
                pedidoId: true,
              },
            },
          },
        },
      },
    });

    if (!row) return null;

    const movements = await this.prisma.movimientoInventario.findMany({
      where: {
        bodegaId: row.bodegaId,
        productoId: row.productoId,
      },
      orderBy: {
        creadoEn: 'desc',
      },
      take: 20,
      include: {
        creadoPor: {
          select: {
            id: true,
            nombre: true,
            correo: true,
            rol: true,
            activo: true,
          },
        },
      },
    });

    return {
      ...this.stockListItem(row),
      reservasActivas: row.reservas.map((reservation) =>
        this.reservationView({
          ...reservation,
          stockBodega: row,
        }),
      ),
      ultimosMovimientos: movements.map((movement) =>
        this.movementView(movement),
      ),
    };
  }

  async getSummary(bodegaId?: number) {
    const where: Prisma.StockBodegaWhereInput = bodegaId
      ? { bodegaId }
      : {};

    const [aggregate, totalRegistros, conExistencia, agotados, values] =
      await this.prisma.$transaction([
        this.prisma.stockBodega.aggregate({
          where,
          _sum: {
            cantidadReal: true,
            cantidadReservada: true,
            cantidadDisponible: true,
          },
        }),
        this.prisma.stockBodega.count({ where }),
        this.prisma.stockBodega.count({
          where: {
            ...where,
            cantidadReal: { gt: 0 },
          },
        }),
        this.prisma.stockBodega.count({
          where: {
            ...where,
            cantidadDisponible: 0,
          },
        }),
        this.prisma.stockBodega.findMany({
          where,
          select: {
            cantidadReal: true,
            costoPromedio: true,
          },
        }),
      ]);

    const inventoryValue = values.reduce(
      (acc, row) =>
        acc.plus(row.costoPromedio.mul(row.cantidadReal)),
      new Prisma.Decimal(0),
    );

    return {
      totalRegistros,
      productosConExistencia: conExistencia,
      productosAgotados: agotados,
      cantidadRealTotal: aggregate._sum.cantidadReal ?? 0,
      cantidadReservadaTotal: aggregate._sum.cantidadReservada ?? 0,
      cantidadDisponibleTotal: aggregate._sum.cantidadDisponible ?? 0,
      valorInventario: money2(inventoryValue),
    };
  }

  async getProductAvailability(productoId: number) {
    const product = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: {
        id: true,
        codigoProducto: true,
        nombre: true,
      },
    });

    if (!product) return null;

    const rows = await this.prisma.stockBodega.findMany({
      where: {
        productoId,
        bodega: {
          activo: true,
        },
      },
      orderBy: [
        {
          bodega: {
            esPrincipal: 'desc',
          },
        },
        {
          bodega: {
            nombre: 'asc',
          },
        },
      ],
      include: {
        bodega: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            esPrincipal: true,
          },
        },
      },
    });

    return {
      producto: {
        id: product.id,
        codigo: product.codigoProducto,
        nombre: product.nombre,
      },
      totales: rows.reduce(
        (acc, row) => ({
          real: acc.real + row.cantidadReal,
          reservado: acc.reservado + row.cantidadReservada,
          disponible: acc.disponible + row.cantidadDisponible,
        }),
        {
          real: 0,
          reservado: 0,
          disponible: 0,
        },
      ),
      bodegas: rows.map((row) => ({
        stockId: row.id,
        bodegaId: row.bodega.id,
        codigo: row.bodega.codigo,
        nombre: row.bodega.nombre,
        esPrincipal: row.bodega.esPrincipal,
        real: row.cantidadReal,
        reservado: row.cantidadReservada,
        disponible: row.cantidadDisponible,
      })),
    };
  }

  async hasAvailability(
    bodegaId: number,
    productoId: number,
    cantidad: number,
  ): Promise<boolean> {
    if (!Number.isInteger(cantidad) || cantidad <= 0) return false;

    const row = await this.prisma.stockBodega.findFirst({
      where: {
        bodegaId,
        productoId,
        cantidadDisponible: {
          gte: cantidad,
        },
        bodega: {
          activo: true,
        },
      },
      select: { id: true },
    });

    return Boolean(row);
  }

  async listMovements(filters: InventoryMovementFilters) {
    const where: Prisma.MovimientoInventarioWhereInput = {
      ...(filters.bodegaId ? { bodegaId: filters.bodegaId } : {}),
      ...(filters.productoId ? { productoId: filters.productoId } : {}),
      ...(filters.tipo ? { tipo: filters.tipo } : {}),
      ...(filters.referenciaTipo
        ? { referenciaTipo: filters.referenciaTipo }
        : {}),
      ...(filters.referenciaId
        ? { referenciaId: filters.referenciaId }
        : {}),
      ...(filters.creadoPorId ? { creadoPorId: filters.creadoPorId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.movimientoInventario.count({ where }),
      this.prisma.movimientoInventario.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: {
          creadoEn: 'desc',
        },
        include: {
          creadoPor: {
            select: {
              id: true,
              nombre: true,
              correo: true,
              rol: true,
              activo: true,
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.movementView(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async listReservations(filters: InventoryReservationFilters) {
    const stockFilter: Prisma.StockBodegaWhereInput = {
      ...(filters.bodegaId ? { bodegaId: filters.bodegaId } : {}),
      ...(filters.productoId ? { productoId: filters.productoId } : {}),
    };

    const where: Prisma.ReservaInventarioWhereInput = {
      ...(filters.pedidoDetalleId
        ? { pedidoDetalleId: filters.pedidoDetalleId }
        : {}),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.bodegaId || filters.productoId
        ? {
            stockBodega: {
              is: stockFilter,
            },
          }
        : {}),
    };

    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.reservaInventario.count({ where }),
      this.prisma.reservaInventario.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: {
          actualizadoEn: 'desc',
        },
        include: {
          pedidoDetalle: {
            select: {
              pedidoId: true,
            },
          },
          stockBodega: {
            include: {
              producto: {
                select: {
                  id: true,
                  codigoProducto: true,
                  nombre: true,
                },
              },
              bodega: {
                select: {
                  id: true,
                  codigo: true,
                  nombre: true,
                  esPrincipal: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.reservationView(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getReservation(
    id: number,
  ): Promise<InventoryReservationView | null> {
    const row = await this.prisma.reservaInventario.findUnique({
      where: { id },
      include: {
        pedidoDetalle: {
          select: {
            pedidoId: true,
          },
        },
        stockBodega: {
          include: {
            producto: {
              select: {
                id: true,
                codigoProducto: true,
                nombre: true,
              },
            },
            bodega: {
              select: {
                id: true,
                codigo: true,
                nombre: true,
                esPrincipal: true,
              },
            },
          },
        },
      },
    });

    return row ? this.reservationView(row) : null;
  }

  private stockListItem(row: any): InventoryStockListItemView {
    const value = new Prisma.Decimal(row.costoPromedio).mul(
      row.cantidadReal,
    );

    return {
      id: row.id,
      producto: {
        id: row.producto.id,
        codigo: row.producto.codigoProducto,
        nombre: row.producto.nombre,
      },
      bodega: {
        id: row.bodega.id,
        codigo: row.bodega.codigo,
        nombre: row.bodega.nombre,
        esPrincipal: row.bodega.esPrincipal,
      },
      cantidadReal: row.cantidadReal,
      cantidadReservada: row.cantidadReservada,
      cantidadDisponible: row.cantidadDisponible,
      costoPromedio: money4(row.costoPromedio),
      valorInventario: money2(value),
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }

  private movementView(row: any) {
    return {
      id: row.id,
      tipo: row.tipo as InventoryMovementType,
      cantidad: row.cantidad,
      costoUnitario: row.costoUnitario
        ? money4(row.costoUnitario)
        : null,
      costoPromedioAntes: money4(row.costoPromedioAntes),
      costoPromedioDespues: money4(row.costoPromedioDespues),
      cantidadRealAntes: row.cantidadRealAntes,
      cantidadRealDespues: row.cantidadRealDespues,
      reservadaAntes: row.reservadaAntes,
      reservadaDespues: row.reservadaDespues,
      referencia:
        row.referenciaTipo && row.referenciaId
          ? {
              type: row.referenciaTipo,
              id: row.referenciaId,
            }
          : null,
      claveIdempotencia: row.claveIdempotencia,
      observaciones: row.observaciones,
      actor: row.creadoPor
        ? {
            ...row.creadoPor,
            rol: row.creadoPor.rol as InventoryUserRole,
          }
        : null,
      creadoEn: row.creadoEn,
    };
  }

  private reservationView(row: any): InventoryReservationView {
    return {
      id: row.id,
      pedidoDetalleId: row.pedidoDetalleId,
      pedidoId: row.pedidoDetalle.pedidoId,
      producto: {
        id: row.stockBodega.producto.id,
        codigo: row.stockBodega.producto.codigoProducto,
        nombre: row.stockBodega.producto.nombre,
      },
      bodega: {
        id: row.stockBodega.bodega.id,
        codigo: row.stockBodega.bodega.codigo,
        nombre: row.stockBodega.bodega.nombre,
        esPrincipal: row.stockBodega.bodega.esPrincipal,
      },
      cantidadOriginal: row.cantidadOriginal,
      cantidadPendiente: row.cantidadPendiente,
      cantidadAplicada: row.cantidadAplicada,
      cantidadLiberada: row.cantidadLiberada,
      estado: row.estado as InventoryReservationState,
      aplicadaEn: row.aplicadaEn,
      liberadaEn: row.liberadaEn,
      cerradaEn: row.cerradaEn,
      canceladaEn: row.canceladaEn,
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }

  private stockOrderBy(
    field: InventoryListFilters['sortBy'],
    direction: InventoryListFilters['sortDir'],
  ): Prisma.StockBodegaOrderByWithRelationInput {
    switch (field) {
      case 'producto':
        return { producto: { nombre: direction } };
      case 'codigoProducto':
        return { producto: { codigoProducto: direction } };
      case 'bodega':
        return { bodega: { nombre: direction } };
      case 'cantidadReal':
        return { cantidadReal: direction };
      case 'cantidadReservada':
        return { cantidadReservada: direction };
      case 'cantidadDisponible':
        return { cantidadDisponible: direction };
      case 'costoPromedio':
        return { costoPromedio: direction };
      case 'actualizadoEn':
        return { actualizadoEn: direction };
      default:
        return { actualizadoEn: 'desc' };
    }
  }
}
