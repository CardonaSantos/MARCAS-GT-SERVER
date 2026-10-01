import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { endOfDay, format, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
// import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import {
  DispatchCandidateFilters,
  DispatchCandidatePage,
  DispatchDetailView,
  DispatchEventFilters,
  DispatchEventPage,
  DispatchEventView,
  DispatchListFilters,
  DispatchListItemView,
  DispatchOperationFilters,
  DispatchOperationPage,
  DispatchOperationView,
  DispatchOperationalReportFilters,
  DispatchOperationalReportView,
  DispatchProgressView,
  DispatchSummaryFilters,
  DispatchSummaryView,
  DispatchTimingView,
} from '../../../application/models/dispatch.models';
import { DispatchQueryPort } from '../../../application/ports/dispatch-query.port';
import {
  DispatchEventType,
  DispatchOperationState,
  DispatchOperationType,
  DispatchState,
} from '../../../dispatch.types';
import { PrismaService } from 'src/prisma.service';

const USER_SELECT = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
} satisfies Prisma.UsuarioSelect;

const PRODUCT_SELECT = {
  id: true,
  codigoProducto: true,
  nombre: true,
} satisfies Prisma.ProductoSelect;

const WAREHOUSE_SELECT = {
  id: true,
  codigo: true,
  nombre: true,
  esPrincipal: true,
} satisfies Prisma.BodegaSelect;

const CUSTOMER_SELECT = {
  id: true,
  nombre: true,
  apellido: true,
  telefono: true,
  correo: true,
  direccion: true,
} satisfies Prisma.ClienteSelect;

@Injectable()
export class DispatchPrismaQueryAdapter implements DispatchQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listCandidates(
    filters: DispatchCandidateFilters,
  ): Promise<DispatchCandidatePage> {
    const search = filters.search?.trim();
    const searchPattern = search ? `%${search}%` : null;

    const vendorClause = filters.vendedorId
      ? Prisma.sql`AND p."vendedorId" = ${filters.vendedorId}`
      : Prisma.sql``;

    const customerClause = filters.clienteId
      ? Prisma.sql`AND p."clienteId" = ${filters.clienteId}`
      : Prisma.sql``;

    const searchClause = searchPattern
      ? Prisma.sql`
          AND (
            COALESCE(p."numero", '') ILIKE ${searchPattern}
            OR c."nombre" ILIKE ${searchPattern}
            OR COALESCE(c."apellido", '') ILIKE ${searchPattern}
            OR c."telefono" ILIKE ${searchPattern}
            OR v."nombre" ILIKE ${searchPattern}
          )
        `
      : Prisma.sql``;

    const candidateCte = Prisma.sql`
      WITH planned AS (
        SELECT
          odd."pedidoDetalleId",
          SUM(odd."cantidadProgramada")::int AS "cantidadProgramada"
        FROM "OrdenDespachoDetalle" odd
        INNER JOIN "OrdenDespacho" od
          ON od."id" = odd."ordenDespachoId"
        WHERE od."estado" <> 'CANCELADA'
        GROUP BY odd."pedidoDetalleId"
      ),
      candidate_orders AS (
        SELECT
          p."id",
          p."confirmadoEn",
          p."creadoEn"
        FROM "Pedido" p
        INNER JOIN "PedidoDetalle" pd
          ON pd."pedidoId" = p."id"
        INNER JOIN "Cliente" c
          ON c."id" = p."clienteId"
        INNER JOIN "Usuario" v
          ON v."id" = p."vendedorId"
        LEFT JOIN planned pl
          ON pl."pedidoDetalleId" = pd."id"
        WHERE p."empresaId" = ${filters.empresaId}
          AND p."estado" IN (
            'CONFIRMADO',
            'EN_PREPARACION',
            'PARCIALMENTE_DESPACHADO'
          )
          ${vendorClause}
          ${customerClause}
          ${searchClause}
        GROUP BY p."id", p."confirmadoEn", p."creadoEn"
        HAVING SUM(
          GREATEST(
            pd."cantidadSolicitada" - GREATEST(
              COALESCE(pl."cantidadProgramada", 0),
              pd."cantidadDespachada"
            ),
            0
          )
        ) > 0
      )
    `;

    const [countRows, idRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        ${candidateCte}
        SELECT COUNT(*)::int AS "count"
        FROM candidate_orders
      `),
      this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        ${candidateCte}
        SELECT "id"
        FROM candidate_orders
        ORDER BY "confirmadoEn" DESC NULLS LAST, "creadoEn" DESC, "id" DESC
        OFFSET ${(filters.page - 1) * filters.limit}
        LIMIT ${filters.limit}
      `),
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const ids = idRows.map((row) => Number(row.id));

    if (!ids.length) {
      return {
        data: [],
        meta: buildPageMeta(total, filters.page, filters.limit),
      };
    }

    const orders = await this.prisma.pedido.findMany({
      where: { id: { in: ids } },
      include: {
        cliente: { select: CUSTOMER_SELECT },
        vendedor: { select: USER_SELECT },
        detalles: {
          orderBy: { id: 'asc' },
          include: { producto: { select: PRODUCT_SELECT } },
        },
      },
    });

    const orderById = new Map(orders.map((order) => [order.id, order]));
    const ordered = ids
      .map((id) => orderById.get(id))
      .filter(Boolean) as typeof orders;

    const detailIds = ordered.flatMap((order) =>
      order.detalles.map((detail) => detail.id),
    );
    const productIds = [
      ...new Set(
        ordered.flatMap((order) =>
          order.detalles.map((detail) => detail.productoId),
        ),
      ),
    ];

    const plannedRows = await this.prisma.ordenDespachoDetalle.groupBy({
      by: ['pedidoDetalleId'],
      where: {
        pedidoDetalleId: { in: detailIds },
        ordenDespacho: {
          is: { estado: { not: 'CANCELADA' } },
        },
      },
      _sum: { cantidadProgramada: true },
    });

    const stocks = filters.bodegaId
      ? await this.prisma.stockBodega.findMany({
          where: {
            bodegaId: filters.bodegaId,
            productoId: { in: productIds },
          },
        })
      : [];

    const plannedByDetail = new Map<number, number>(
      plannedRows.map((row: any) => [
        row.pedidoDetalleId,
        Number(row._sum.cantidadProgramada ?? 0),
      ]),
    );
    const stockByProduct = new Map<number, any>(
      stocks.map((stock: any) => [stock.productoId, stock]),
    );

    const data = ordered.map((order) => {
      const lines = order.detalles
        .map((detail) => {
          const planned = plannedByDetail.get(detail.id) ?? 0;
          const committed = Math.max(planned, detail.cantidadDespachada);
          const pending = Math.max(0, detail.cantidadSolicitada - committed);
          const stock = stockByProduct.get(detail.productoId);

          return {
            pedidoDetalleId: detail.id,
            producto: this.product(detail.producto),
            cantidadSolicitada: detail.cantidadSolicitada,
            cantidadReservada: detail.cantidadReservada,
            cantidadDespachada: detail.cantidadDespachada,
            cantidadEntregada: detail.cantidadEntregada,
            cantidadProgramadaActiva: planned,
            cantidadPendientePlanificar: pending,
            disponibilidadBodega:
              filters.bodegaId != null
                ? {
                    bodegaId: filters.bodegaId,
                    stockId: stock?.id ?? null,
                    real: stock?.cantidadReal ?? 0,
                    reservado: stock?.cantidadReservada ?? 0,
                    disponible: stock?.cantidadDisponible ?? 0,
                    suficienteParaPendiente:
                      (stock?.cantidadDisponible ?? 0) >= pending,
                  }
                : null,
          };
        })
        .filter((line) => line.cantidadPendientePlanificar > 0);

      const totals = lines.reduce(
        (acc, line) => {
          acc.requested += line.cantidadSolicitada;
          acc.dispatched += line.cantidadDespachada;
          acc.planned += line.cantidadProgramadaActiva;
          acc.pending += line.cantidadPendientePlanificar;
          return acc;
        },
        { requested: 0, dispatched: 0, planned: 0, pending: 0 },
      );

      return {
        pedido: {
          id: order.id,
          numero: order.numero ?? `PED-${String(order.id).padStart(6, '0')}`,
          estado: String(order.estado),
          condicionPago: String(order.condicionPago),
          estadoPago: String(order.estadoPago),
          total: money(order.total),
          vendedor: this.user(order.vendedor),
          confirmadoEn: order.confirmadoEn,
          creadoEn: order.creadoEn,
        },
        cliente: this.customer(order.cliente),
        lineas: lines,
        totales: {
          unidadesSolicitadas: totals.requested,
          unidadesDespachadas: totals.dispatched,
          unidadesProgramadasActivas: totals.planned,
          unidadesPendientesPlanificar: totals.pending,
        },
      };
    });

    return {
      data,
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async list(filters: DispatchListFilters) {
    const where = this.buildWhere(filters);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.ordenDespacho.count({ where }),
      this.prisma.ordenDespacho.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: this.orderBy(filters),
        include: {
          pedido: {
            include: {
              cliente: { select: CUSTOMER_SELECT },
              vendedor: { select: USER_SELECT },
            },
          },
          bodega: { select: WAREHOUSE_SELECT },
          creadoPor: { select: USER_SELECT },
          preparadoPor: { select: USER_SELECT },
          despachadoPor: { select: USER_SELECT },
          detalles: {
            orderBy: { id: 'asc' },
            include: {
              producto: { select: PRODUCT_SELECT },
              pedidoDetalle: {
                select: {
                  cantidadSolicitada: true,
                  cantidadReservada: true,
                  cantidadDespachada: true,
                  cantidadEntregada: true,
                },
              },
            },
          },
          eventos: {
            orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
            take: 1,
            include: { usuario: { select: USER_SELECT } },
          },
        },
      }),
    ]);

    const operationSummary = await this.operationSummaryByDispatch(
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row: any) =>
        this.toListItem(row, operationSummary.get(row.id)),
      ),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getById(
    id: number,
    scope: { empresaId: number; vendedorId?: number; rol: string },
  ): Promise<DispatchDetailView | null> {
    const row = await this.prisma.ordenDespacho.findFirst({
      where: {
        id,
        pedido: {
          is: {
            empresaId: scope.empresaId,
            ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
          },
        },
      },
      include: {
        pedido: {
          include: {
            cliente: { select: CUSTOMER_SELECT },
            vendedor: { select: USER_SELECT },
          },
        },
        bodega: { select: WAREHOUSE_SELECT },
        creadoPor: { select: USER_SELECT },
        preparadoPor: { select: USER_SELECT },
        despachadoPor: { select: USER_SELECT },
        canceladoPor: { select: USER_SELECT },
        detalles: {
          orderBy: { id: 'asc' },
          include: {
            producto: { select: PRODUCT_SELECT },
            pedidoDetalle: {
              select: {
                cantidadSolicitada: true,
                cantidadReservada: true,
                cantidadDespachada: true,
                cantidadEntregada: true,
              },
            },
          },
        },
        eventos: {
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          take: 30,
          include: { usuario: { select: USER_SELECT } },
        },
        envios: {
          orderBy: { creadoEn: 'desc' },
          take: 20,
          include: {
            envio: {
              select: {
                id: true,
                estado: true,
                guia: true,
                salidaEn: true,
                completadoEn: true,
                creadoEn: true,
              },
            },
          },
        },
        entregas: {
          orderBy: { creadoEn: 'desc' },
          take: 20,
          select: {
            id: true,
            estado: true,
            receptorNombre: true,
            entregadoEn: true,
            creadoEn: true,
          },
        },
      },
    });

    if (!row) return null;

    const detailIds = row.detalles.map((detail) => detail.pedidoDetalleId);
    const productIds = row.detalles.map((detail) => detail.productoId);

    const [reservations, stocks, operations] = await Promise.all([
      this.prisma.reservaInventario.findMany({
        where: {
          pedidoDetalleId: { in: detailIds },
          stockBodega: { is: { bodegaId: row.bodegaId } },
        },
        include: { stockBodega: true },
      }),
      this.prisma.stockBodega.findMany({
        where: {
          bodegaId: row.bodegaId,
          productoId: { in: productIds },
        },
      }),
      this.loadOperationViews({
        dispatchIds: [row.id],
        limit: 20,
      }),
    ]);

    const reservationByDetail = new Map<number, any>(
      reservations.map((reservation) => [
        reservation.pedidoDetalleId,
        reservation,
      ]),
    );
    const stockByProduct = new Map<number, any>(
      stocks.map((stock) => [stock.productoId, stock]),
    );

    const details = row.detalles.map((detail) => {
      const reservation = reservationByDetail.get(detail.pedidoDetalleId);
      const stock =
        reservation?.stockBodega ?? stockByProduct.get(detail.productoId);

      return {
        id: detail.id,
        pedidoDetalleId: detail.pedidoDetalleId,
        producto: this.product(detail.producto),
        pedido: {
          cantidadSolicitada: detail.pedidoDetalle.cantidadSolicitada,
          cantidadReservada: detail.pedidoDetalle.cantidadReservada,
          cantidadDespachada: detail.pedidoDetalle.cantidadDespachada,
          cantidadEntregada: detail.pedidoDetalle.cantidadEntregada,
        },
        despacho: {
          cantidadProgramada: detail.cantidadProgramada,
          cantidadPreparada: detail.cantidadPreparada,
          cantidadDespachada: detail.cantidadDespachada,
          pendientePreparar:
            detail.cantidadProgramada - detail.cantidadPreparada,
          pendienteDespachar:
            detail.cantidadPreparada - detail.cantidadDespachada,
          porcentajePreparacion: percent(
            detail.cantidadPreparada,
            detail.cantidadProgramada,
          ),
          porcentajeDespacho: percent(
            detail.cantidadDespachada,
            detail.cantidadProgramada,
          ),
        },
        inventario: {
          stockId: stock?.id ?? null,
          real: stock?.cantidadReal ?? 0,
          reservado: stock?.cantidadReservada ?? 0,
          disponible: stock?.cantidadDisponible ?? 0,
          reserva: reservation
            ? {
                id: reservation.id,
                estado: String(reservation.estado),
                cantidadOriginal: reservation.cantidadOriginal,
                cantidadPendiente: reservation.cantidadPendiente,
                cantidadAplicada: reservation.cantidadAplicada,
                cantidadLiberada: reservation.cantidadLiberada,
              }
            : null,
        },
        observaciones: detail.observaciones,
        version: detail.version,
        creadoEn: detail.creadoEn,
        actualizadoEn: detail.actualizadoEn,
      };
    });

    const summary = summarizeOperations(
      operations.filter((operation) => operation.ordenDespachoId === row.id),
    );

    const listBase = this.toListItem(row, summary);

    return {
      ...listBase,
      version: row.version,
      motivoCancelacion: row.motivoCancelacion,
      canceladoPor: row.canceladoPor ? this.user(row.canceladoPor) : null,
      detalles: details,
      operacionesRecientes: operations,
      eventosRecientes: row.eventos.map((event: any) => this.event(event)),
      envios: row.envios.map((link) => ({
        id: link.envio.id,
        estado: String(link.envio.estado),
        guia: link.envio.guia,
        salidaEn: link.envio.salidaEn,
        completadoEn: link.envio.completadoEn,
        creadoEn: link.envio.creadoEn,
      })),
      entregas: row.entregas.map((delivery) => ({
        id: delivery.id,
        estado: String(delivery.estado),
        receptorNombre: delivery.receptorNombre,
        entregadoEn: delivery.entregadoEn,
        creadoEn: delivery.creadoEn,
      })),
      acciones: actionsFor(row.estado, scope.rol),
      advertencias: this.warnings(row, details, operations),
    };
  }

  async listEvents(
    id: number,
    filters: DispatchEventFilters,
  ): Promise<DispatchEventPage> {
    const where: Prisma.OrdenDespachoEventoWhereInput = {
      ordenDespachoId: id,
      ordenDespacho: {
        is: {
          pedido: {
            is: {
              empresaId: filters.empresaId,
              ...(filters.vendedorId ? { vendedorId: filters.vendedorId } : {}),
            },
          },
        },
      },
      ...(filters.tipo ? { tipo: filters.tipo as any } : {}),
      ...(filters.usuarioId ? { usuarioId: filters.usuarioId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.ordenDespachoEvento.count({ where }),
      this.prisma.ordenDespachoEvento.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        include: { usuario: { select: USER_SELECT } },
      }),
    ]);

    return {
      data: rows.map((row: any) => this.event(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async listOperations(
    filters: DispatchOperationFilters,
  ): Promise<DispatchOperationPage> {
    const dispatchIds = await this.allowedDispatchIds(
      filters.empresaId,
      filters.vendedorId,
      filters.dispatchId,
    );

    if (!dispatchIds.length) {
      return {
        data: [],
        meta: buildPageMeta(0, filters.page, filters.limit),
      };
    }

    const where: Prisma.OperacionDespachoWhereInput = {
      ordenDespachoId: { in: dispatchIds },
      ...(filters.tipo ? { tipo: filters.tipo as any } : {}),
      ...(filters.estado ? { estado: filters.estado as any } : {}),
      ...(filters.usuarioId ? { usuarioId: filters.usuarioId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            ocurridaEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const total = await this.prisma.operacionDespacho.count({ where });

    const data = await this.loadOperationViews({
      where,
      skip: (filters.page - 1) * filters.limit,
      limit: filters.limit,
    });

    return {
      data,
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getSummary(
    filters: DispatchSummaryFilters,
  ): Promise<DispatchSummaryView> {
    const where: Prisma.OrdenDespachoWhereInput = {
      pedido: {
        is: {
          empresaId: filters.empresaId,
          ...(filters.vendedorId ? { vendedorId: filters.vendedorId } : {}),
        },
      },
      ...(filters.bodegaId ? { bodegaId: filters.bodegaId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.ordenDespacho.findMany({
      where,
      select: {
        id: true,
        estado: true,
        bodega: { select: WAREHOUSE_SELECT },
        creadoEn: true,
        actualizadoEn: true,
        programadoEn: true,
        preparacionIniciadaEn: true,
        preparadoEn: true,
        despachadoEn: true,
        detalles: {
          select: {
            cantidadProgramada: true,
            cantidadPreparada: true,
            cantidadDespachada: true,
          },
        },
      },
    });

    const dispatchIds = rows.map((row) => row.id);
    const operations = dispatchIds.length
      ? await this.prisma.operacionDespacho.findMany({
          where: { ordenDespachoId: { in: dispatchIds } },
        })
      : [];
    const operationDetails = operations.length
      ? await this.prisma.operacionDespachoDetalle.findMany({
          where: {
            operacionId: {
              in: operations.map((operation) => operation.id),
            },
          },
        })
      : [];
    const users = operations.length
      ? await this.prisma.usuario.findMany({
          where: {
            id: {
              in: [
                ...new Set(operations.map((operation) => operation.usuarioId)),
              ],
            },
          },
          select: USER_SELECT,
        })
      : [];

    const userById = new Map(users.map((user) => [user.id, user]));
    const detailByOperation = groupBy(
      operationDetails,
      (detail) => detail.operacionId,
    );

    const stateCounts: Record<DispatchState, number> = {
      PENDIENTE: 0,
      PREPARANDO: 0,
      PREPARADA: 0,
      PARCIALMENTE_DESPACHADA: 0,
      DESPACHADA: 0,
      CANCELADA: 0,
    };

    let programmed = 0;
    let prepared = 0;
    let dispatched = 0;
    let delayed = 0;

    const waitPreparation: number[] = [];
    const preparationTimes: number[] = [];
    const waitExit: number[] = [];
    const cycles: number[] = [];
    const warehouseMap = new Map<number, any>();
    const now = new Date();

    for (const row of rows) {
      stateCounts[row.estado as DispatchState] += 1;

      const units = row.detalles.reduce(
        (acc, line) => {
          acc.programmed += line.cantidadProgramada;
          acc.prepared += line.cantidadPreparada;
          acc.dispatched += line.cantidadDespachada;
          return acc;
        },
        { programmed: 0, prepared: 0, dispatched: 0 },
      );

      programmed += units.programmed;
      prepared += units.prepared;
      dispatched += units.dispatched;

      if (
        row.programadoEn &&
        row.programadoEn < now &&
        !['DESPACHADA', 'CANCELADA'].includes(row.estado)
      ) {
        delayed += 1;
      }

      pushDuration(waitPreparation, row.creadoEn, row.preparacionIniciadaEn);
      pushDuration(
        preparationTimes,
        row.preparacionIniciadaEn,
        row.preparadoEn,
      );
      pushDuration(waitExit, row.preparadoEn, row.despachadoEn);
      pushDuration(cycles, row.creadoEn, row.despachadoEn);

      const entry = warehouseMap.get(row.bodega.id) ?? {
        bodega: this.warehouse(row.bodega),
        ordenes: 0,
        unidadesDespachadas: 0,
      };

      entry.ordenes += 1;
      entry.unidadesDespachadas += units.dispatched;
      warehouseMap.set(row.bodega.id, entry);
    }

    const operationCounts = {
      total: operations.length,
      pendientes: operations.filter((item) => item.estado === 'PENDIENTE')
        .length,
      aplicando: operations.filter((item) => item.estado === 'APLICANDO')
        .length,
      aplicadas: operations.filter((item) => item.estado === 'APLICADA').length,
      fallidas: operations.filter((item) => item.estado === 'FALLIDA').length,
    };

    const operatorMap = new Map<number, any>();

    for (const operation of operations) {
      if (operation.estado !== 'APLICADA') continue;

      const user = userById.get(operation.usuarioId);
      if (!user) continue;

      const lines = detailByOperation.get(operation.id) ?? [];
      const entry = operatorMap.get(user.id) ?? {
        usuario: this.user(user),
        operacionesAplicadas: 0,
        unidadesProcesadas: 0,
      };

      entry.operacionesAplicadas += 1;
      entry.unidadesProcesadas += lines
        .filter((line) => line.estado === 'APLICADA')
        .reduce((sum, line) => sum + line.cantidad, 0);

      operatorMap.set(user.id, entry);
    }

    const day = guatemalaDayRange(now);

    return {
      totalOrdenes: rows.length,
      porEstado: stateCounts,
      abiertas:
        stateCounts.PENDIENTE +
        stateCounts.PREPARANDO +
        stateCounts.PREPARADA +
        stateCounts.PARCIALMENTE_DESPACHADA,
      atrasadas: delayed,
      unidades: {
        programadas: programmed,
        preparadas: prepared,
        despachadas: dispatched,
        pendientesPreparacion: programmed - prepared,
        pendientesDespacho: prepared - dispatched,
      },
      porcentajes: {
        preparacion: percent(prepared, programmed),
        despacho: percent(dispatched, programmed),
      },
      tiemposPromedioHoras: {
        esperaPreparacion: average(waitPreparation),
        preparacion: average(preparationTimes),
        esperaSalida: average(waitExit),
        cicloCompleto: average(cycles),
      },
      operaciones: operationCounts,
      hoy: {
        programadas: rows.filter(
          (row) =>
            row.programadoEn &&
            row.programadoEn >= day.start &&
            row.programadoEn <= day.end,
        ).length,
        creadas: rows.filter(
          (row) => row.creadoEn >= day.start && row.creadoEn <= day.end,
        ).length,
        preparadas: rows.filter(
          (row) =>
            row.preparadoEn &&
            row.preparadoEn >= day.start &&
            row.preparadoEn <= day.end,
        ).length,
        despachadas: rows.filter(
          (row) =>
            row.despachadoEn &&
            row.despachadoEn >= day.start &&
            row.despachadoEn <= day.end,
        ).length,
        atrasadas: rows.filter(
          (row) =>
            row.programadoEn &&
            row.programadoEn < now &&
            row.programadoEn >= day.start &&
            !['DESPACHADA', 'CANCELADA'].includes(row.estado),
        ).length,
        preparandoAhora: stateCounts.PREPARANDO,
        preparadasEsperandoSalida: stateCounts.PREPARADA,
      },
      topBodegas: [...warehouseMap.values()]
        .sort((a, b) => b.unidadesDespachadas - a.unidadesDespachadas)
        .slice(0, 10),
      topOperadores: [...operatorMap.values()]
        .sort((a, b) => b.unidadesProcesadas - a.unidadesProcesadas)
        .slice(0, 10),
    };
  }

  async getOperationalReport(
    filters: DispatchOperationalReportFilters,
  ): Promise<DispatchOperationalReportView> {
    const now = new Date();
    const hasta = filters.fechaHasta ?? now;
    const desde =
      filters.fechaDesde ??
      new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);

    const scope: Prisma.OrdenDespachoWhereInput = {
      pedido: {
        is: {
          empresaId: filters.empresaId,
          ...(filters.vendedorId ? { vendedorId: filters.vendedorId } : {}),
        },
      },
      ...(filters.bodegaId ? { bodegaId: filters.bodegaId } : {}),
    };

    const [createdRows, preparedRows, dispatchedRows, openRows, scopedIds] =
      await Promise.all([
        this.prisma.ordenDespacho.findMany({
          where: {
            ...scope,
            creadoEn: { gte: desde, lte: hasta },
          },
          select: { id: true, creadoEn: true },
        }),
        this.prisma.ordenDespacho.findMany({
          where: {
            ...scope,
            preparadoEn: { gte: desde, lte: hasta },
          },
          select: {
            id: true,
            preparadoEn: true,
            preparacionIniciadaEn: true,
          },
        }),
        this.prisma.ordenDespacho.findMany({
          where: {
            ...scope,
            despachadoEn: { gte: desde, lte: hasta },
          },
          select: {
            id: true,
            creadoEn: true,
            programadoEn: true,
            preparacionIniciadaEn: true,
            preparadoEn: true,
            despachadoEn: true,
            bodega: { select: WAREHOUSE_SELECT },
            detalles: {
              select: { cantidadDespachada: true },
            },
          },
        }),
        this.prisma.ordenDespacho.findMany({
          where: {
            ...scope,
            estado: {
              in: [
                'PENDIENTE',
                'PREPARANDO',
                'PREPARADA',
                'PARCIALMENTE_DESPACHADA',
              ],
            },
          },
          select: { id: true, creadoEn: true },
        }),
        this.prisma.ordenDespacho.findMany({
          where: scope,
          select: { id: true },
        }),
      ]);

    const dispatchIds = scopedIds.map((row) => row.id);
    const operations = dispatchIds.length
      ? await this.prisma.operacionDespacho.findMany({
          where: {
            ordenDespachoId: { in: dispatchIds },
            ocurridaEn: { gte: desde, lte: hasta },
          },
          select: {
            id: true,
            estado: true,
            intentos: true,
            ocurridaEn: true,
          },
        })
      : [];

    const trend = new Map<
      string,
      {
        fecha: string;
        creadas: number;
        preparadas: number;
        despachadas: number;
        unidadesDespachadas: number;
        fallosOperacion: number;
      }
    >();

    const dayEntry = (date: Date) => {
      const key = guatemalaDateKey(date);
      const current = trend.get(key) ?? {
        fecha: key,
        creadas: 0,
        preparadas: 0,
        despachadas: 0,
        unidadesDespachadas: 0,
        fallosOperacion: 0,
      };
      trend.set(key, current);
      return current;
    };

    for (const row of createdRows) {
      dayEntry(row.creadoEn).creadas += 1;
    }
    for (const row of preparedRows) {
      if (row.preparadoEn) dayEntry(row.preparadoEn).preparadas += 1;
    }
    for (const row of dispatchedRows) {
      if (!row.despachadoEn) continue;
      const entry = dayEntry(row.despachadoEn);
      entry.despachadas += 1;
      entry.unidadesDespachadas += row.detalles.reduce(
        (sum, detail) => sum + detail.cantidadDespachada,
        0,
      );
    }
    for (const operation of operations) {
      if (operation.estado === 'FALLIDA') {
        dayEntry(operation.ocurridaEn).fallosOperacion += 1;
      }
    }

    let aTiempo = 0;
    let tarde = 0;
    let sinProgramacion = 0;

    for (const row of dispatchedRows) {
      if (!row.despachadoEn) continue;
      if (!row.programadoEn) {
        sinProgramacion += 1;
      } else if (row.despachadoEn <= row.programadoEn) {
        aTiempo += 1;
      } else {
        tarde += 1;
      }
    }

    const openAging = {
      total: openRows.length,
      menos4h: 0,
      de4a8h: 0,
      de8a24h: 0,
      de24a48h: 0,
      mas48h: 0,
    };

    for (const row of openRows) {
      const age = hoursBetween(row.creadoEn, now);
      if (age < 4) openAging.menos4h += 1;
      else if (age < 8) openAging.de4a8h += 1;
      else if (age < 24) openAging.de8a24h += 1;
      else if (age < 48) openAging.de24a48h += 1;
      else openAging.mas48h += 1;
    }

    const applied = operations.filter(
      (operation) => operation.estado === 'APLICADA',
    ).length;
    const failed = operations.filter(
      (operation) => operation.estado === 'FALLIDA',
    ).length;
    const retried = operations.filter(
      (operation) => operation.intentos > 1,
    ).length;
    const attempts = operations.reduce(
      (sum, operation) => sum + operation.intentos,
      0,
    );

    const warehouseMap = new Map<number, any>();

    for (const row of dispatchedRows) {
      if (!row.despachadoEn) continue;

      const current = warehouseMap.get(row.bodega.id) ?? {
        bodega: this.warehouse(row.bodega),
        ordenes: 0,
        despachadas: 0,
        unidadesDespachadas: 0,
        onTime: 0,
        withSchedule: 0,
        prepTimes: [] as number[],
        cycleTimes: [] as number[],
      };

      current.ordenes += 1;
      current.despachadas += 1;
      current.unidadesDespachadas += row.detalles.reduce(
        (sum, detail) => sum + detail.cantidadDespachada,
        0,
      );

      if (row.programadoEn) {
        current.withSchedule += 1;
        if (row.despachadoEn <= row.programadoEn) {
          current.onTime += 1;
        }
      }

      pushDuration(
        current.prepTimes,
        row.preparacionIniciadaEn,
        row.preparadoEn,
      );
      pushDuration(current.cycleTimes, row.creadoEn, row.despachadoEn);

      warehouseMap.set(row.bodega.id, current);
    }

    return {
      rango: {
        desde,
        hasta,
        dias: Math.max(
          1,
          Math.ceil(
            (hasta.getTime() - desde.getTime()) / (24 * 60 * 60 * 1000),
          ),
        ),
      },
      puntualidad: {
        despachadas: dispatchedRows.length,
        aTiempo,
        tarde,
        sinProgramacion,
        porcentajeATiempo: percent(aTiempo, aTiempo + tarde),
      },
      colaAbierta: openAging,
      confiabilidadOperaciones: {
        total: operations.length,
        aplicadas: applied,
        fallidas: failed,
        conReintentos: retried,
        tasaFallo: percent(failed, operations.length),
        porcentajeConReintento: percent(retried, operations.length),
        intentosPromedio:
          operations.length > 0
            ? Math.round((attempts / operations.length) * 100) / 100
            : 0,
      },
      tendenciaDiaria: [...trend.values()].sort((a, b) =>
        a.fecha.localeCompare(b.fecha),
      ),
      bodegas: [...warehouseMap.values()]
        .map((entry) => ({
          bodega: entry.bodega,
          ordenes: entry.ordenes,
          despachadas: entry.despachadas,
          unidadesDespachadas: entry.unidadesDespachadas,
          porcentajeATiempo: percent(entry.onTime, entry.withSchedule),
          horasPromedioPreparacion: average(entry.prepTimes),
          horasPromedioCiclo: average(entry.cycleTimes),
        }))
        .sort((a, b) => b.unidadesDespachadas - a.unidadesDespachadas),
    };
  }

  private async allowedDispatchIds(
    empresaId: number,
    vendedorId?: number,
    dispatchId?: number,
  ): Promise<number[]> {
    const rows = await this.prisma.ordenDespacho.findMany({
      where: {
        ...(dispatchId ? { id: dispatchId } : {}),
        pedido: {
          is: {
            empresaId,
            ...(vendedorId ? { vendedorId } : {}),
          },
        },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async operationSummaryByDispatch(
    dispatchIds: number[],
  ): Promise<Map<number, any>> {
    const map = new Map<number, any>();

    if (!dispatchIds.length) return map;

    const operations = await this.prisma.operacionDespacho.findMany({
      where: { ordenDespachoId: { in: dispatchIds } },
      orderBy: [{ ocurridaEn: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        ordenDespachoId: true,
        tipo: true,
        estado: true,
        ocurridaEn: true,
      },
    });

    for (const dispatchId of dispatchIds) {
      const own = operations.filter(
        (operation) => operation.ordenDespachoId === dispatchId,
      );
      map.set(dispatchId, {
        total: own.length,
        pendientes: own.filter((operation) => operation.estado === 'PENDIENTE')
          .length,
        aplicando: own.filter((operation) => operation.estado === 'APLICANDO')
          .length,
        fallidas: own.filter((operation) => operation.estado === 'FALLIDA')
          .length,
        ultimaOperacion: own[0]
          ? {
              id: own[0].id,
              tipo: own[0].tipo as DispatchOperationType,
              estado: own[0].estado as DispatchOperationState,
              ocurridaEn: own[0].ocurridaEn,
            }
          : null,
      });
    }

    return map;
  }

  private async loadOperationViews(input: {
    dispatchIds?: number[];
    where?: Prisma.OperacionDespachoWhereInput;
    skip?: number;
    limit?: number;
  }): Promise<DispatchOperationView[]> {
    const where =
      input.where ??
      (input.dispatchIds ? { ordenDespachoId: { in: input.dispatchIds } } : {});

    const operations = await this.prisma.operacionDespacho.findMany({
      where,
      skip: input.skip,
      take: input.limit,
      orderBy: [{ ocurridaEn: 'desc' }, { id: 'desc' }],
    });

    if (!operations.length) return [];

    const operationIds = operations.map((operation) => operation.id);
    const dispatchIds = [
      ...new Set(operations.map((operation) => operation.ordenDespachoId)),
    ];
    const userIds = [
      ...new Set(operations.map((operation) => operation.usuarioId)),
    ];

    const [lines, dispatches, users] = await Promise.all([
      this.prisma.operacionDespachoDetalle.findMany({
        where: { operacionId: { in: operationIds } },
        orderBy: { id: 'asc' },
      }),
      this.prisma.ordenDespacho.findMany({
        where: { id: { in: dispatchIds } },
        select: { id: true, numero: true },
      }),
      this.prisma.usuario.findMany({
        where: { id: { in: userIds } },
        select: USER_SELECT,
      }),
    ]);

    const dispatchById = new Map(
      dispatches.map((dispatch) => [dispatch.id, dispatch]),
    );
    const userById = new Map(users.map((user) => [user.id, user]));
    const linesByOperation = groupBy(lines, (line) => line.operacionId);

    const orderDetailIds = [
      ...new Set(lines.map((line) => line.ordenDespachoDetalleId)),
    ];

    const orderDetails = orderDetailIds.length
      ? await this.prisma.ordenDespachoDetalle.findMany({
          where: { id: { in: orderDetailIds } },
          include: { producto: { select: PRODUCT_SELECT } },
        })
      : [];

    const orderDetailById = new Map(
      orderDetails.map((detail) => [detail.id, detail]),
    );

    return operations.map((operation) => {
      const dispatch = dispatchById.get(operation.ordenDespachoId);
      const user = userById.get(operation.usuarioId);
      const ownLines = linesByOperation.get(operation.id) ?? [];

      return {
        id: operation.id,
        ordenDespachoId: operation.ordenDespachoId,
        numeroDespacho:
          dispatch?.numero ??
          `DSP-${String(operation.ordenDespachoId).padStart(6, '0')}`,
        tipo: operation.tipo as DispatchOperationType,
        estado: operation.estado as DispatchOperationState,
        usuario: user
          ? this.user(user)
          : {
              id: operation.usuarioId,
              nombre: 'Usuario no disponible',
              correo: '',
              rol: 'DESCONOCIDO',
            },
        claveIdempotencia: operation.claveIdempotencia,
        observaciones: operation.observaciones,
        ocurridaEn: operation.ocurridaEn,
        iniciadaEn: operation.iniciadaEn,
        ultimoIntentoEn: operation.ultimoIntentoEn,
        aplicadaEn: operation.aplicadaEn,
        fallidaEn: operation.fallidaEn,
        intentos: operation.intentos,
        errorAplicacion: operation.errorAplicacion,
        version: operation.version,
        detalles: ownLines.map((line) => {
          const detail = orderDetailById.get(line.ordenDespachoDetalleId);
          return {
            id: line.id,
            ordenDespachoDetalleId: line.ordenDespachoDetalleId,
            producto: detail
              ? this.product(detail.producto)
              : {
                  id: 0,
                  codigo: '',
                  nombre: 'Producto no disponible',
                },
            cantidad: line.cantidad,
            estado: String(line.estado),
            reservaInventarioId: line.reservaInventarioId,
            movimientoInventarioId: line.movimientoInventarioId,
            claveIdempotencia: line.claveIdempotencia,
            aplicadaEn: line.aplicadaEn,
            errorAplicacion: line.errorAplicacion,
            actualizadoEn: line.actualizadoEn,
          };
        }),
        unidades: ownLines.reduce((sum, line) => sum + line.cantidad, 0),
        creadoEn: operation.creadoEn,
        actualizadoEn: operation.actualizadoEn,
      };
    });
  }

  private buildWhere(
    filters: DispatchListFilters,
  ): Prisma.OrdenDespachoWhereInput {
    const search = filters.search?.trim();
    const openStates: DispatchState[] = [
      'PENDIENTE',
      'PREPARANDO',
      'PREPARADA',
      'PARCIALMENTE_DESPACHADA',
    ];

    const and: Prisma.OrdenDespachoWhereInput[] = [];

    if (filters.estado) and.push({ estado: filters.estado as any });
    if (filters.soloPendientes) {
      and.push({ estado: { in: openStates as any } });
    }
    if (filters.soloAtrasados) {
      and.push({
        programadoEn: { lt: new Date() },
        estado: { in: openStates as any },
      });
    }
    if (filters.conPendientePreparacion) {
      and.push({ estado: 'PREPARANDO' as any });
    }
    if (filters.conPendienteDespacho) {
      and.push({
        estado: {
          in: ['PREPARADA', 'PARCIALMENTE_DESPACHADA'] as any,
        },
      });
    }
    if (filters.programadoDesde || filters.programadoHasta) {
      and.push({
        programadoEn: {
          ...(filters.programadoDesde ? { gte: filters.programadoDesde } : {}),
          ...(filters.programadoHasta ? { lte: filters.programadoHasta } : {}),
        },
      });
    }

    return {
      pedido: {
        is: {
          empresaId: filters.empresaId,
          ...(filters.vendedorId ? { vendedorId: filters.vendedorId } : {}),
          ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
        },
      },
      ...(filters.pedidoId ? { pedidoId: filters.pedidoId } : {}),
      ...(filters.bodegaId ? { bodegaId: filters.bodegaId } : {}),
      ...(filters.creadoPorId ? { creadoPorId: filters.creadoPorId } : {}),
      ...(filters.preparadoPorId
        ? { preparadoPorId: filters.preparadoPorId }
        : {}),
      ...(filters.despachadoPorId
        ? { despachadoPorId: filters.despachadoPorId }
        : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(and.length ? { AND: and } : {}),
      ...(search
        ? {
            OR: [
              { numero: { contains: search, mode: 'insensitive' } },
              {
                pedido: {
                  is: {
                    numero: { contains: search, mode: 'insensitive' },
                  },
                },
              },
              {
                pedido: {
                  is: {
                    cliente: {
                      is: {
                        OR: [
                          {
                            nombre: {
                              contains: search,
                              mode: 'insensitive',
                            },
                          },
                          {
                            apellido: {
                              contains: search,
                              mode: 'insensitive',
                            },
                          },
                          {
                            telefono: {
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
              {
                bodega: {
                  is: {
                    OR: [
                      {
                        nombre: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        codigo: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private orderBy(
    filters: DispatchListFilters,
  ): Prisma.OrdenDespachoOrderByWithRelationInput[] {
    const direction = filters.sortDir;

    switch (filters.sortBy) {
      case 'numero':
        return [{ numero: direction }, { id: 'desc' }];
      case 'estado':
        return [{ estado: direction }, { id: 'desc' }];
      case 'programadoEn':
        return [{ programadoEn: direction }, { id: 'desc' }];
      case 'pedido':
        return [{ pedido: { numero: direction } }, { id: 'desc' }];
      case 'cliente':
        return [{ pedido: { cliente: { nombre: direction } } }, { id: 'desc' }];
      case 'bodega':
        return [{ bodega: { nombre: direction } }, { id: 'desc' }];
      case 'preparadoEn':
        return [{ preparadoEn: direction }, { id: 'desc' }];
      case 'despachadoEn':
        return [{ despachadoEn: direction }, { id: 'desc' }];
      case 'actualizadoEn':
        return [{ actualizadoEn: direction }, { id: 'desc' }];
      default:
        return [{ creadoEn: direction }, { id: 'desc' }];
    }
  }

  private toListItem(
    row: any,
    operations?: {
      total: number;
      pendientes: number;
      aplicando: number;
      fallidas: number;
      ultimaOperacion: any;
    },
  ): DispatchListItemView {
    return {
      id: row.id,
      numero: row.numero ?? `DSP-${String(row.id).padStart(6, '0')}`,
      estado: row.estado as DispatchState,
      pedido: {
        id: row.pedido.id,
        numero:
          row.pedido.numero ?? `PED-${String(row.pedido.id).padStart(6, '0')}`,
        estado: String(row.pedido.estado),
        condicionPago: String(row.pedido.condicionPago),
        estadoPago: String(row.pedido.estadoPago),
        total: money(row.pedido.total),
        vendedor: this.user(row.pedido.vendedor),
      },
      cliente: this.customer(row.pedido.cliente),
      bodega: this.warehouse(row.bodega),
      creadoPor: row.creadoPor ? this.user(row.creadoPor) : null,
      preparadoPor: row.preparadoPor ? this.user(row.preparadoPor) : null,
      despachadoPor: row.despachadoPor ? this.user(row.despachadoPor) : null,
      progreso: this.progress(row.detalles),
      tiempos: this.timing(row),
      operaciones: operations ?? {
        total: 0,
        pendientes: 0,
        aplicando: 0,
        fallidas: 0,
        ultimaOperacion: null,
      },
      observaciones: row.observaciones,
      ultimaActividad: row.eventos?.[0]
        ? {
            tipo: row.eventos[0].tipo as DispatchEventType,
            actor: row.eventos[0].usuario
              ? this.user(row.eventos[0].usuario)
              : null,
            creadoEn: row.eventos[0].creadoEn,
          }
        : null,
    };
  }

  private progress(details: any[]): DispatchProgressView {
    const totals = details.reduce(
      (acc, detail) => {
        acc.programmed += detail.cantidadProgramada;
        acc.prepared += detail.cantidadPreparada;
        acc.dispatched += detail.cantidadDespachada;
        return acc;
      },
      { programmed: 0, prepared: 0, dispatched: 0 },
    );

    return {
      productos: details.length,
      unidadesProgramadas: totals.programmed,
      unidadesPreparadas: totals.prepared,
      unidadesDespachadas: totals.dispatched,
      unidadesPendientesPreparacion: totals.programmed - totals.prepared,
      unidadesPendientesDespacho: totals.prepared - totals.dispatched,
      porcentajePreparacion: percent(totals.prepared, totals.programmed),
      porcentajeDespacho: percent(totals.dispatched, totals.programmed),
    };
  }

  private timing(row: any): DispatchTimingView {
    const now = new Date();
    const overdue =
      row.programadoEn &&
      row.programadoEn < now &&
      !['DESPACHADA', 'CANCELADA'].includes(row.estado);

    return {
      creadoEn: row.creadoEn,
      programadoEn: row.programadoEn,
      preparacionIniciadaEn: row.preparacionIniciadaEn,
      preparadoEn: row.preparadoEn,
      despachadoEn: row.despachadoEn,
      canceladoEn: row.canceladoEn,
      actualizadoEn: row.actualizadoEn,
      atrasado: Boolean(overdue),
      horasAtraso: overdue ? hoursBetween(row.programadoEn, now) : 0,
      horasEsperaPreparacion: durationOrNull(
        row.creadoEn,
        row.preparacionIniciadaEn,
      ),
      horasPreparacion: durationOrNull(
        row.preparacionIniciadaEn,
        row.preparadoEn,
      ),
      horasEsperaSalida: durationOrNull(row.preparadoEn, row.despachadoEn),
      horasCicloTotal: durationOrNull(row.creadoEn, row.despachadoEn),
      horasDesdeActualizacion: hoursBetween(row.actualizadoEn, now),
    };
  }

  private event(row: any): DispatchEventView {
    return {
      id: row.id,
      tipo: row.tipo as DispatchEventType,
      detalle: row.detalle,
      actor: row.usuario ? this.user(row.usuario) : null,
      referencia:
        row.referenciaTipo && row.referenciaId
          ? {
              tipo: row.referenciaTipo,
              id: row.referenciaId,
            }
          : null,
      metadata: row.metadata ?? null,
      creadoEn: row.creadoEn,
    };
  }

  private warnings(
    row: any,
    details: any[],
    operations: DispatchOperationView[],
  ) {
    const result: Array<{
      codigo: string;
      nivel: 'INFO' | 'ADVERTENCIA' | 'CRITICO';
      mensaje: string;
    }> = [];
    const now = new Date();

    if (
      !row.programadoEn &&
      !['DESPACHADA', 'CANCELADA'].includes(row.estado)
    ) {
      result.push({
        codigo: 'SIN_PROGRAMACION',
        nivel: 'INFO',
        mensaje: 'La orden no tiene fecha/hora objetivo de salida.',
      });
    }

    if (
      row.programadoEn &&
      row.programadoEn < now &&
      !['DESPACHADA', 'CANCELADA'].includes(row.estado)
    ) {
      result.push({
        codigo: 'PROGRAMACION_ATRASADA',
        nivel: 'CRITICO',
        mensaje: `La orden acumula ${hoursBetween(
          row.programadoEn,
          now,
        )} horas de atraso respecto a su programación.`,
      });
    }

    if (
      row.estado === 'PREPARANDO' &&
      details.some(
        (line) =>
          line.despacho.cantidadPreparada < line.despacho.cantidadProgramada,
      )
    ) {
      result.push({
        codigo: 'PREPARACION_INCOMPLETA',
        nivel: 'ADVERTENCIA',
        mensaje: 'Aún existen unidades pendientes de preparación.',
      });
    }

    if (
      ['PREPARADA', 'PARCIALMENTE_DESPACHADA'].includes(row.estado) &&
      details.some((line) => line.despacho.pendienteDespachar > 0)
    ) {
      result.push({
        codigo: 'SALIDA_PENDIENTE',
        nivel: 'ADVERTENCIA',
        mensaje: 'Hay unidades preparadas que todavía no han salido de bodega.',
      });
    }

    if (operations.some((operation) => operation.estado === 'FALLIDA')) {
      result.push({
        codigo: 'OPERACION_FALLIDA',
        nivel: 'CRITICO',
        mensaje:
          'Existe una operación fallida que requiere revisión o reintento.',
      });
    }

    if (
      details.some(
        (line) =>
          line.despacho.pendientePreparar > 0 &&
          line.inventario.disponible < line.despacho.pendientePreparar &&
          !line.inventario.reserva,
      )
    ) {
      result.push({
        codigo: 'STOCK_DISPONIBLE_LIMITADO',
        nivel: 'ADVERTENCIA',
        mensaje:
          'Una o más líneas no muestran disponibilidad suficiente en la bodega.',
      });
    }

    return result;
  }

  private user(row: any) {
    return {
      id: row.id,
      nombre: row.nombre,
      correo: row.correo,
      rol: String(row.rol),
    };
  }

  private warehouse(row: any) {
    return {
      id: row.id,
      codigo: row.codigo,
      nombre: row.nombre,
      esPrincipal: row.esPrincipal,
    };
  }

  private customer(row: any) {
    return {
      id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      nombreCompleto: [row.nombre, row.apellido].filter(Boolean).join(' '),
      telefono: row.telefono,
      correo: row.correo,
      direccion: row.direccion,
    };
  }

  private product(row: any) {
    return {
      id: row.id,
      codigo: row.codigoProducto,
      nombre: row.nombre,
    };
  }
}

function summarizeOperations(operations: DispatchOperationView[]) {
  const own = [...operations].sort(
    (a, b) => b.ocurridaEn.getTime() - a.ocurridaEn.getTime() || b.id - a.id,
  );

  return {
    total: own.length,
    pendientes: own.filter((item) => item.estado === 'PENDIENTE').length,
    aplicando: own.filter((item) => item.estado === 'APLICANDO').length,
    fallidas: own.filter((item) => item.estado === 'FALLIDA').length,
    ultimaOperacion: own[0]
      ? {
          id: own[0].id,
          tipo: own[0].tipo,
          estado: own[0].estado,
          ocurridaEn: own[0].ocurridaEn,
        }
      : null,
  };
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();

  for (const row of rows) {
    const value = key(row);
    const current = map.get(value) ?? [];
    current.push(row);
    map.set(value, current);
  }

  return map;
}

function actionsFor(state: string, role: string) {
  const operative = ['ADMIN', 'BODEGA'].includes(role);
  const canObserve = [
    'ADMIN',
    'BODEGA',
    'CONTABILIDAD',
    'VENDEDOR',
    'REPARTIDOR',
  ].includes(role);

  return {
    puedeEditar: operative && state === 'PENDIENTE',
    puedeIniciarPreparacion: operative && state === 'PENDIENTE',
    puedeActualizarPreparacion: operative && state === 'PREPARANDO',
    puedeFinalizarPreparacion: operative && state === 'PREPARANDO',
    puedeDespachar:
      operative && ['PREPARADA', 'PARCIALMENTE_DESPACHADA'].includes(state),
    puedeCancelar:
      operative && ['PENDIENTE', 'PREPARANDO', 'PREPARADA'].includes(state),
    puedeAgregarObservacion: canObserve && state !== 'CANCELADA',
  };
}

function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 10000) / 100;
}

function money(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function hoursBetween(start: Date, end: Date): number {
  return Math.max(
    0,
    Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100,
  );
}

function durationOrNull(start?: Date | null, end?: Date | null): number | null {
  return start && end ? hoursBetween(start, end) : null;
}

function pushDuration(
  target: number[],
  start?: Date | null,
  end?: Date | null,
) {
  if (start && end) {
    target.push(hoursBetween(start, end));
  }
}

function average(values: number[]): number | null {
  if (!values.length) return null;

  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
    ) / 100
  );
}

function guatemalaDayRange(now: Date) {
  const timezone = 'America/Guatemala';
  const local = toZonedTime(now, timezone);

  return {
    start: fromZonedTime(startOfDay(local), timezone),
    end: fromZonedTime(endOfDay(local), timezone),
  };
}

function guatemalaDateKey(date: Date): string {
  return format(toZonedTime(date, 'America/Guatemala'), 'yyyy-MM-dd');
}
