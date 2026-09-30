import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  buildPageMeta,
} from 'src/shared/application/pagination/page.models';
import {
  TransferDetailView,
  TransferEventFilters,
  TransferEventPage,
  TransferListFilters,
  TransferListItemView,
  TransferOperationFilters,
  TransferOperationPage,
  TransferOperationView,
  TransferPage,
  TransferSummaryFilters,
  TransferSummaryView,
} from '../../../application/models/transfer.models';
import { TransferQueryPort } from '../../../application/ports/transfer-query.port';

const warehouseSelect = {
  id: true,
  codigo: true,
  nombre: true,
  esPrincipal: true,
} satisfies Prisma.BodegaSelect;

const userSelect = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
} satisfies Prisma.UsuarioSelect;

const listInclude = {
  bodegaOrigen: { select: warehouseSelect },
  bodegaDestino: { select: warehouseSelect },
  creadoPor: { select: userSelect },
  detalles: {
    select: {
      cantidadSolicitada: true,
      cantidadEnviada: true,
      cantidadRecibida: true,
    },
  },
} satisfies Prisma.TransferenciaBodegaInclude;

const operationInclude = {
  usuario: { select: userSelect },
  detalles: {
    orderBy: { id: 'asc' as const },
    include: {
      transferenciaDetalle: {
        include: {
          producto: {
            select: {
              id: true,
              codigoProducto: true,
              nombre: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.TransferenciaBodegaOperacionInclude;

type TransferListRow =
  Prisma.TransferenciaBodegaGetPayload<{ include: typeof listInclude }>;

type OperationRow =
  Prisma.TransferenciaBodegaOperacionGetPayload<{
    include: typeof operationInclude;
  }>;

@Injectable()
export class TransferPrismaQueryAdapter implements TransferQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: TransferListFilters): Promise<TransferPage> {
    const where = this.transferWhere(filters);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transferenciaBodega.count({ where }),
      this.prisma.transferenciaBodega.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: this.transferOrderBy(filters),
        include: listInclude,
      }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getById(id: number): Promise<TransferDetailView | null> {
    const row = await this.prisma.transferenciaBodega.findUnique({
      where: { id },
      include: {
        bodegaOrigen: { select: warehouseSelect },
        bodegaDestino: { select: warehouseSelect },
        creadoPor: { select: userSelect },
        detalles: {
          orderBy: { id: 'asc' },
          include: {
            producto: {
              select: {
                id: true,
                codigoProducto: true,
                nombre: true,
              },
            },
          },
        },
        operaciones: {
          orderBy: [
            { ocurridaEn: 'desc' },
            { id: 'desc' },
          ],
          take: 30,
          include: operationInclude,
        },
        eventos: {
          orderBy: [
            { creadoEn: 'desc' },
            { id: 'desc' },
          ],
          take: 30,
          include: {
            usuario: {
              select: userSelect,
            },
          },
        },
      },
    });

    if (!row) return null;

    const listItem = this.toListItem(row);

    return {
      ...listItem,
      version: row.version,
      motivoCancelacion: row.motivoCancelacion,
      canceladaEn: row.canceladaEn,
      detalles: row.detalles.map((detail) => {
        const inTransit =
          detail.cantidadEnviada - detail.cantidadRecibida;
        const pendingSend =
          detail.cantidadSolicitada - detail.cantidadEnviada;
        return {
          id: detail.id,
          producto: {
            id: detail.producto.id,
            codigo: detail.producto.codigoProducto,
            nombre: detail.producto.nombre,
          },
          cantidadSolicitada: detail.cantidadSolicitada,
          cantidadEnviada: detail.cantidadEnviada,
          cantidadRecibida: detail.cantidadRecibida,
          cantidadEnTransito: inTransit,
          cantidadPendienteEnvio: pendingSend,
          porcentajeRecepcion:
            detail.cantidadEnviada === 0
              ? 0
              : roundPercent(
                  detail.cantidadRecibida,
                  detail.cantidadEnviada,
                ),
          observaciones: detail.observaciones,
          version: detail.version,
        };
      }),
      operaciones: row.operaciones.map((operation) =>
        this.toOperation(operation),
      ),
      eventos: row.eventos.map((event) => ({
        id: event.id,
        tipo: event.tipo,
        detalle: event.detalle,
        actor: event.usuario
          ? {
              id: event.usuario.id,
              nombre: event.usuario.nombre,
              correo: event.usuario.correo,
              rol: event.usuario.rol,
            }
          : null,
        creadoEn: event.creadoEn,
      })),
      acciones: {
        puedeEditar: row.estado === 'BORRADOR',
        puedePreparar: row.estado === 'BORRADOR',
        puedeEnviar: row.estado === 'PREPARADA',
        puedeRecibir: ['EN_TRANSITO', 'RECIBIDA_PARCIAL'].includes(
          row.estado,
        ),
        puedeCancelar: ['BORRADOR', 'PREPARADA'].includes(row.estado),
      },
    };
  }

  async listEvents(
    id: number,
    filters: TransferEventFilters,
  ): Promise<TransferEventPage> {
    const where: Prisma.TransferenciaBodegaEventoWhereInput = {
      transferenciaId: id,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transferenciaBodegaEvento.count({ where }),
      this.prisma.transferenciaBodegaEvento.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [
          { creadoEn: 'desc' },
          { id: 'desc' },
        ],
        include: {
          usuario: {
            select: userSelect,
          },
        },
      }),
    ]);

    return {
      data: rows.map((event) => ({
        id: event.id,
        tipo: event.tipo,
        detalle: event.detalle,
        actor: event.usuario
          ? {
              id: event.usuario.id,
              nombre: event.usuario.nombre,
              correo: event.usuario.correo,
              rol: event.usuario.rol,
            }
          : null,
        creadoEn: event.creadoEn,
      })),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async listOperations(
    filters: TransferOperationFilters,
  ): Promise<TransferOperationPage> {
    const where: Prisma.TransferenciaBodegaOperacionWhereInput = {
      ...(filters.transferenciaId
        ? { transferenciaId: filters.transferenciaId }
        : {}),
      ...(filters.usuarioId ? { usuarioId: filters.usuarioId } : {}),
      ...(filters.tipo ? { tipo: filters.tipo } : {}),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            ocurridaEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filters.bodegaOrigenId || filters.bodegaDestinoId
        ? {
            transferencia: {
              is: {
                ...(filters.bodegaOrigenId
                  ? { bodegaOrigenId: filters.bodegaOrigenId }
                  : {}),
                ...(filters.bodegaDestinoId
                  ? { bodegaDestinoId: filters.bodegaDestinoId }
                  : {}),
              },
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transferenciaBodegaOperacion.count({ where }),
      this.prisma.transferenciaBodegaOperacion.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [
          { ocurridaEn: 'desc' },
          { id: 'desc' },
        ],
        include: operationInclude,
      }),
    ]);

    return {
      data: rows.map((row) => this.toOperation(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getSummary(
    filters: TransferSummaryFilters = {},
  ): Promise<TransferSummaryView> {
    const where: Prisma.TransferenciaBodegaWhereInput = {
      ...(filters.bodegaOrigenId
        ? { bodegaOrigenId: filters.bodegaOrigenId }
        : {}),
      ...(filters.bodegaDestinoId
        ? { bodegaDestinoId: filters.bodegaDestinoId }
        : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const operationWhereBase: Prisma.TransferenciaBodegaOperacionWhereInput = {
      transferencia: { is: where },
    };

    const [rows, operacionesPendientes, operacionesFallidas] =
      await this.prisma.$transaction([
        this.prisma.transferenciaBodega.findMany({
          where,
          select: {
            estado: true,
            detalles: {
              select: {
                cantidadSolicitada: true,
                cantidadEnviada: true,
                cantidadRecibida: true,
                operacionDetalles: {
                  where: {
                    operacion: {
                      is: {
                        tipo: 'SALIDA',
                        estado: 'APLICADA',
                      },
                    },
                  },
                  select: {
                    costoUnitario: true,
                  },
                  orderBy: { id: 'asc' },
                  take: 1,
                },
              },
            },
          },
        }),
        this.prisma.transferenciaBodegaOperacion.count({
          where: {
            ...operationWhereBase,
            estado: 'PENDIENTE',
          },
        }),
        this.prisma.transferenciaBodegaOperacion.count({
          where: {
            ...operationWhereBase,
            estado: 'FALLIDA',
          },
        }),
      ]);

    const states = {
      BORRADOR: 0,
      PREPARADA: 0,
      EN_TRANSITO: 0,
      RECIBIDA_PARCIAL: 0,
      RECIBIDA: 0,
      CANCELADA: 0,
    };

    let requested = 0;
    let sent = 0;
    let received = 0;
    let transitValue = new Prisma.Decimal(0);

    for (const row of rows) {
      states[row.estado] += 1;

      for (const detail of row.detalles) {
        requested += detail.cantidadSolicitada;
        sent += detail.cantidadEnviada;
        received += detail.cantidadRecibida;

        const inTransit =
          detail.cantidadEnviada - detail.cantidadRecibida;
        const cost = detail.operacionDetalles[0]?.costoUnitario;

        if (inTransit > 0 && cost != null) {
          transitValue = transitValue.add(cost.mul(inTransit));
        }
      }
    }

    return {
      total: rows.length,
      borradores: states.BORRADOR,
      preparadas: states.PREPARADA,
      enTransito: states.EN_TRANSITO,
      recibidasParcial: states.RECIBIDA_PARCIAL,
      recibidas: states.RECIBIDA,
      canceladas: states.CANCELADA,
      abiertas:
        states.BORRADOR +
        states.PREPARADA +
        states.EN_TRANSITO +
        states.RECIBIDA_PARCIAL,
      unidadesSolicitadas: requested,
      unidadesEnviadas: sent,
      unidadesRecibidas: received,
      unidadesEnTransito: sent - received,
      valorEnTransito: transitValue.toFixed(2),
      operacionesPendientes,
      operacionesFallidas,
    };
  }

  private transferWhere(
    filters: TransferListFilters,
  ): Prisma.TransferenciaBodegaWhereInput {
    const search = filters.search?.trim();

    return {
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.bodegaOrigenId
        ? { bodegaOrigenId: filters.bodegaOrigenId }
        : {}),
      ...(filters.bodegaDestinoId
        ? { bodegaDestinoId: filters.bodegaDestinoId }
        : {}),
      ...(filters.creadoPorId
        ? { creadoPorId: filters.creadoPorId }
        : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filters.soloPendientes
        ? {
            estado: {
              in: [
                'BORRADOR',
                'PREPARADA',
                'EN_TRANSITO',
                'RECIBIDA_PARCIAL',
              ],
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                observaciones: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                bodegaOrigen: {
                  is: {
                    OR: [
                      {
                        codigo: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        nombre: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
              {
                bodegaDestino: {
                  is: {
                    OR: [
                      {
                        codigo: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        nombre: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
              {
                creadoPor: {
                  is: {
                    OR: [
                      {
                        nombre: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        correo: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
              {
                detalles: {
                  some: {
                    producto: {
                      is: {
                        OR: [
                          {
                            codigoProducto: {
                              contains: search,
                              mode: 'insensitive',
                            },
                          },
                          {
                            nombre: {
                              contains: search,
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private transferOrderBy(
    filters: TransferListFilters,
  ): Prisma.TransferenciaBodegaOrderByWithRelationInput[] {
    switch (filters.sortBy) {
      case 'bodegaOrigen':
        return [
          { bodegaOrigen: { nombre: filters.sortDir } },
          { id: 'desc' },
        ];
      case 'bodegaDestino':
        return [
          { bodegaDestino: { nombre: filters.sortDir } },
          { id: 'desc' },
        ];
      case 'creadoPor':
        return [
          { creadoPor: { nombre: filters.sortDir } },
          { id: 'desc' },
        ];
      case 'actualizadoEn':
        return [
          { actualizadoEn: filters.sortDir },
          { id: 'desc' },
        ];
      case 'estado':
        return [
          { estado: filters.sortDir },
          { id: 'desc' },
        ];
      default:
        return [
          { creadoEn: filters.sortDir },
          { id: 'desc' },
        ];
    }
  }

  private toListItem(row: TransferListRow): TransferListItemView {
    const progress = row.detalles.reduce(
      (acc, detail) => ({
        productos: acc.productos + 1,
        solicitadas: acc.solicitadas + detail.cantidadSolicitada,
        enviadas: acc.enviadas + detail.cantidadEnviada,
        recibidas: acc.recibidas + detail.cantidadRecibida,
      }),
      {
        productos: 0,
        solicitadas: 0,
        enviadas: 0,
        recibidas: 0,
      },
    );

    return {
      id: row.id,
      estado: row.estado,
      bodegaOrigen: {
        id: row.bodegaOrigen.id,
        codigo: row.bodegaOrigen.codigo,
        nombre: row.bodegaOrigen.nombre,
        esPrincipal: row.bodegaOrigen.esPrincipal,
      },
      bodegaDestino: {
        id: row.bodegaDestino.id,
        codigo: row.bodegaDestino.codigo,
        nombre: row.bodegaDestino.nombre,
        esPrincipal: row.bodegaDestino.esPrincipal,
      },
      creadoPor: {
        id: row.creadoPor.id,
        nombre: row.creadoPor.nombre,
        correo: row.creadoPor.correo,
        rol: row.creadoPor.rol,
      },
      progreso: {
        productos: progress.productos,
        unidadesSolicitadas: progress.solicitadas,
        unidadesEnviadas: progress.enviadas,
        unidadesRecibidas: progress.recibidas,
        unidadesEnTransito: progress.enviadas - progress.recibidas,
        unidadesPendientesEnvio:
          progress.solicitadas - progress.enviadas,
        porcentajeRecepcion:
          progress.enviadas === 0
            ? 0
            : roundPercent(progress.recibidas, progress.enviadas),
      },
      observaciones: row.observaciones,
      preparadaEn: row.preparadaEn,
      enviadaEn: row.enviadaEn,
      recibidaEn: row.recibidaEn,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }

  private toOperation(row: OperationRow): TransferOperationView {
    let total = new Prisma.Decimal(0);
    let hasCost = row.detalles.length > 0;

    const details = row.detalles.map((line) => {
      const cost = line.costoUnitario;
      if (cost == null) {
        hasCost = false;
      } else {
        total = total.add(cost.mul(line.cantidad));
      }

      return {
        id: line.id,
        transferenciaDetalleId: line.transferenciaDetalleId,
        producto: {
          id: line.transferenciaDetalle.producto.id,
          codigo:
            line.transferenciaDetalle.producto.codigoProducto,
          nombre: line.transferenciaDetalle.producto.nombre,
        },
        cantidad: line.cantidad,
        costoUnitario: cost?.toFixed(4) ?? null,
        subtotal:
          cost == null ? null : cost.mul(line.cantidad).toFixed(2),
      };
    });

    return {
      id: row.id,
      transferenciaId: row.transferenciaId,
      tipo: row.tipo,
      estado: row.estado,
      usuario: {
        id: row.usuario.id,
        nombre: row.usuario.nombre,
        correo: row.usuario.correo,
        rol: row.usuario.rol,
      },
      claveIdempotencia: row.claveIdempotencia,
      documentoReferencia: row.documentoReferencia,
      observaciones: row.observaciones,
      ocurridaEn: row.ocurridaEn,
      aplicadaEn: row.aplicadaEn,
      errorAplicacion: row.errorAplicacion,
      version: row.version,
      detalles: details,
      unidades: row.detalles.reduce(
        (sum, line) => sum + line.cantidad,
        0,
      ),
      costoTotal: hasCost ? total.toFixed(2) : null,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }
}

function roundPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 10000) / 100;
}
