import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import {
  OrderActionsView,
  OrderDetailView,
  OrderEventFilters,
  OrderEventView,
  OrderListFilters,
  OrderListItemView,
  OrderProgressView,
  OrderSummaryFilters,
  OrderSummaryView,
} from '../../../application/models/order.models';
import { OrderQueryPort } from '../../../application/ports/order-query.port';
import {
  OrderEventType,
  OrderPaymentCondition,
  OrderPaymentState,
  OrderState,
} from '../../../order.types';

const money = (value: Prisma.Decimal | string | number) =>
  new Prisma.Decimal(value).toFixed(2);

const ORDER_LIST_INCLUDE = {
  cliente: {
    select: {
      id: true,
      nombre: true,
      apellido: true,
      telefono: true,
      correo: true,
      direccion: true,
    },
  },
  vendedor: {
    select: { id: true, nombre: true, correo: true, rol: true },
  },
  visita: {
    select: { id: true, inicio: true, fin: true, estadoVisita: true },
  },
  detalles: {
    include: {
      producto: {
        select: { id: true, codigoProducto: true, nombre: true },
      },
    },
    orderBy: { id: 'asc' as const },
  },
  solicitudesCredito: {
    orderBy: { solicitadaEn: 'desc' as const },
    take: 1,
    select: { id: true, estado: true, montoSolicitado: true },
  },
  ordenesDespacho: {
    orderBy: { creadoEn: 'desc' as const },
    take: 1,
    include: {
      bodega: { select: { id: true, codigo: true, nombre: true } },
      preparadoPor: {
        select: { id: true, nombre: true, correo: true, rol: true },
      },
    },
  },
  entregas: {
    orderBy: { creadoEn: 'desc' as const },
    take: 1,
    select: { id: true, estado: true, entregadoEn: true },
  },
  facturas: {
    orderBy: { creadoEn: 'desc' as const },
    take: 1,
    select: {
      id: true,
      estado: true,
      serie: true,
      numero: true,
      total: true,
      emitidaEn: true,
    },
  },
} satisfies Prisma.PedidoInclude;

@Injectable()
export class OrderPrismaQueryAdapter implements OrderQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: OrderListFilters) {
    const where = this.buildWhere(filters);
    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.pedido.count({ where }),
      this.prisma.pedido.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: this.orderBy(filters),
        include: ORDER_LIST_INCLUDE,
      }),
    ]);

    const paymentMap = await this.paymentSummaries(rows.map((row) => row.id));

    return {
      data: rows.map((row) => this.toListItem(row, paymentMap.get(row.id))),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getById(
    id: number,
    scope: { empresaId: number; vendedorId?: number },
  ): Promise<OrderDetailView | null> {
    const row = await this.prisma.pedido.findFirst({
      where: {
        id,
        empresaId: scope.empresaId,
        ...(scope.vendedorId ? { vendedorId: scope.vendedorId } : {}),
      },
      include: {
        cliente: ORDER_LIST_INCLUDE.cliente,
        vendedor: ORDER_LIST_INCLUDE.vendedor,
        visita: ORDER_LIST_INCLUDE.visita,
        detalles: ORDER_LIST_INCLUDE.detalles,
        solicitudesCredito: {
          orderBy: { solicitadaEn: 'desc' },
          take: 20,
          select: {
            id: true,
            estado: true,
            montoSolicitado: true,
            plazoDias: true,
            anticipoPropuesto: true,
            solicitadaEn: true,
            resueltaEn: true,
          },
        },
        ordenesDespacho: {
          orderBy: { creadoEn: 'desc' },
          take: 20,
          include: {
            bodega: { select: { id: true, codigo: true, nombre: true } },
            preparadoPor: {
              select: { id: true, nombre: true, correo: true, rol: true },
            },
          },
        },
        entregas: {
          orderBy: { creadoEn: 'desc' },
          take: 20,
          include: {
            registradoPor: {
              select: { id: true, nombre: true, correo: true, rol: true },
            },
          },
        },
        pagos: {
          orderBy: { fechaPago: 'desc' },
          take: 20,
          select: {
            id: true,
            metodo: true,
            estado: true,
            monto: true,
            referencia: true,
            fechaPago: true,
            verificadoEn: true,
          },
        },
        facturas: {
          orderBy: { creadoEn: 'desc' },
          take: 20,
          select: {
            id: true,
            estado: true,
            serie: true,
            numero: true,
            total: true,
            emitidaEn: true,
            fechaVencimiento: true,
          },
        },
        eventos: {
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          take: 20,
          include: {
            usuario: {
              select: { id: true, nombre: true, correo: true, rol: true },
            },
          },
        },
      },
    });

    if (!row) return null;

    const paymentMap = await this.paymentSummaries([row.id]);
    const paymentSummary = paymentMap.get(row.id) ?? {
      cantidad: 0,
      registrado: new Prisma.Decimal(0),
      verificado: new Prisma.Decimal(0),
    };

    const progress = this.progress(row.detalles);
    const payments = row.pagos;
    const registered = paymentSummary.registrado;
    const verified = paymentSummary.verificado;
    const pendingRaw = new Prisma.Decimal(row.total).minus(verified);
    const pending = pendingRaw.isNegative()
      ? new Prisma.Decimal(0)
      : pendingRaw;

    const latestCredit = row.solicitudesCredito[0] ?? null;
    const latestDispatch = row.ordenesDespacho[0] ?? null;
    const latestDelivery = row.entregas[0] ?? null;
    const latestInvoice = row.facturas[0] ?? null;

    return {
      id: row.id,
      numero: row.numero ?? formatLegacyOrderNumber(row.id),
      estado: row.estado as OrderState,
      condicionPago: row.condicionPago as OrderPaymentCondition,
      estadoPago: row.estadoPago as OrderPaymentState,
      cliente: this.customer(row.cliente),
      vendedor: this.user(row.vendedor),
      visita: row.visita
        ? {
            id: row.visita.id,
            inicio: row.visita.inicio,
            fin: row.visita.fin,
            estado: String(row.visita.estadoVisita),
          }
        : null,
      progreso: progress,
      subtotal: money(row.subtotal),
      descuentoTotal: money(row.descuentoTotal),
      total: money(row.total),
      moneda: row.moneda,
      credito: latestCredit
        ? {
            solicitudId: latestCredit.id,
            estado: String(latestCredit.estado),
            montoSolicitado: money(latestCredit.montoSolicitado),
          }
        : null,
      despacho: latestDispatch ? this.latestDispatch(latestDispatch) : null,
      entrega: latestDelivery
        ? {
            id: latestDelivery.id,
            estado: String(latestDelivery.estado),
            entregadoEn: latestDelivery.entregadoEn,
          }
        : null,
      pagos: {
        cantidad: paymentSummary.cantidad,
        montoRegistrado: money(registered),
        montoVerificado: money(verified),
        montoPendienteEstimado: money(pending),
      },
      factura: latestInvoice
        ? {
            id: latestInvoice.id,
            estado: String(latestInvoice.estado),
            serie: latestInvoice.serie,
            numero: latestInvoice.numero,
            total: money(latestInvoice.total),
            emitidaEn: latestInvoice.emitidaEn,
          }
        : null,
      observaciones: row.observaciones,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
      validacionSolicitadaEn: row.validacionSolicitadaEn,
      confirmadoEn: row.confirmadoEn,
      canceladoEn: row.canceladoEn,
      motivoCancelacion: row.motivoCancelacion,
      version: row.version,
      detalles: row.detalles.map((detail) => this.toDetailLine(detail)),
      solicitudesCredito: row.solicitudesCredito.map((credit) => ({
        id: credit.id,
        estado: String(credit.estado),
        montoSolicitado: money(credit.montoSolicitado),
        plazoDias: credit.plazoDias,
        anticipoPropuesto: money(credit.anticipoPropuesto),
        solicitadaEn: credit.solicitadaEn,
        resueltaEn: credit.resueltaEn,
      })),
      despachos: row.ordenesDespacho.map((dispatch) => ({
        id: dispatch.id,
        estado: String(dispatch.estado),
        bodega: {
          id: dispatch.bodega.id,
          codigo: dispatch.bodega.codigo,
          nombre: dispatch.bodega.nombre,
        },
        preparadoPor: dispatch.preparadoPor
          ? this.user(dispatch.preparadoPor)
          : null,
        programadoEn: dispatch.programadoEn,
        preparadoEn: dispatch.preparadoEn,
        despachadoEn: dispatch.despachadoEn,
        creadoEn: dispatch.creadoEn,
      })),
      entregas: row.entregas.map((delivery) => ({
        id: delivery.id,
        estado: String(delivery.estado),
        registradoPor: delivery.registradoPor
          ? this.user(delivery.registradoPor)
          : null,
        entregadoEn: delivery.entregadoEn,
        creadoEn: delivery.creadoEn,
      })),
      pagosDetalle: row.pagos.map((payment) => ({
        id: payment.id,
        metodo: String(payment.metodo),
        estado: String(payment.estado),
        monto: money(payment.monto),
        referencia: payment.referencia,
        fechaPago: payment.fechaPago,
        verificadoEn: payment.verificadoEn,
      })),
      facturas: row.facturas.map((invoice) => ({
        id: invoice.id,
        estado: String(invoice.estado),
        serie: invoice.serie,
        numero: invoice.numero,
        total: money(invoice.total),
        emitidaEn: invoice.emitidaEn,
        fechaVencimiento: invoice.fechaVencimiento,
      })),
      ultimosEventos: row.eventos.map((event) => this.toEvent(event)),
      acciones: this.actions(
        row.estado as OrderState,
        row.condicionPago as OrderPaymentCondition,
      ),
    };
  }

  async listEvents(pedidoId: number, filters: OrderEventFilters) {
    const where: Prisma.PedidoEventoWhereInput = {
      pedidoId,
      pedido: {
        is: {
          empresaId: filters.empresaId,
          ...(filters.vendedorId ? { vendedorId: filters.vendedorId } : {}),
        },
      },
      ...(filters.tipo ? { tipo: filters.tipo } : {}),
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

    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.pedidoEvento.count({ where }),
      this.prisma.pedidoEvento.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        include: {
          usuario: {
            select: { id: true, nombre: true, correo: true, rol: true },
          },
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.toEvent(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getSummary(filters: OrderSummaryFilters): Promise<OrderSummaryView> {
    const where = this.buildSummaryWhere(filters);

    const [
      aggregate,
      byState,
      byPayment,
      byCondition,
      details,
      verifiedPayments,
    ] = await Promise.all([
      this.prisma.pedido.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          subtotal: true,
          descuentoTotal: true,
          total: true,
        },
      }),

      this.prisma.pedido.groupBy({
        by: ['estado'],
        where,
        _count: { _all: true },
      }),

      this.prisma.pedido.groupBy({
        by: ['estadoPago'],
        where,
        _count: { _all: true },
      }),

      this.prisma.pedido.groupBy({
        by: ['condicionPago'],
        where,
        _count: { _all: true },
      }),

      this.prisma.pedidoDetalle.aggregate({
        where: {
          pedido: {
            is: where,
          },
        },
        _sum: {
          cantidadSolicitada: true,
          cantidadReservada: true,
          cantidadDespachada: true,
          cantidadEntregada: true,
        },
      }),

      this.prisma.pago.aggregate({
        where: {
          estado: 'VERIFICADO',
          pedido: {
            is: where,
          },
        },
        _sum: {
          monto: true,
        },
      }),
    ]);

    const topSellers = await this.prisma.pedido.groupBy({
      by: ['vendedorId'],
      where,
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    });

    const topProducts = await this.prisma.pedidoDetalle.groupBy({
      by: ['productoId'],
      where: { pedido: { is: where } },
      _sum: { cantidadSolicitada: true, subtotal: true },
      orderBy: { _sum: { cantidadSolicitada: 'desc' } },
      take: 10,
    });

    const [sellers, products] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where: { id: { in: topSellers.map((row) => row.vendedorId) } },
        select: { id: true, nombre: true, correo: true, rol: true },
      }),
      this.prisma.producto.findMany({
        where: { id: { in: topProducts.map((row) => row.productoId) } },
        select: { id: true, codigoProducto: true, nombre: true },
      }),
    ]);

    const sellerMap = new Map(sellers.map((row) => [row.id, row]));
    const productMap = new Map(products.map((row) => [row.id, row]));
    const totalAmount = new Prisma.Decimal(aggregate._sum.total ?? 0);
    const paid = new Prisma.Decimal(verifiedPayments._sum.monto ?? 0);
    const pendingRaw = totalAmount.minus(paid);
    const pending = pendingRaw.isNegative()
      ? new Prisma.Decimal(0)
      : pendingRaw;

    return {
      totalPedidos: aggregate._count._all,
      montos: {
        subtotal: money(aggregate._sum.subtotal ?? 0),
        descuentoTotal: money(aggregate._sum.descuentoTotal ?? 0),
        total: money(totalAmount),
        pagadoVerificado: money(paid),
        pendienteEstimado: money(pending),
      },
      unidades: {
        solicitadas: details._sum.cantidadSolicitada ?? 0,
        reservadas: details._sum.cantidadReservada ?? 0,
        despachadas: details._sum.cantidadDespachada ?? 0,
        entregadas: details._sum.cantidadEntregada ?? 0,
      },
      porEstado: this.stateCounters(byState),
      porEstadoPago: this.paymentCounters(byPayment),
      porCondicionPago: this.conditionCounters(byCondition),
      topVendedores: topSellers.flatMap((row) => {
        const seller = sellerMap.get(row.vendedorId);
        if (!seller) return [];
        return [
          {
            vendedor: this.user(seller),
            pedidos: row._count._all,
            monto: money(row._sum.total ?? 0),
          },
        ];
      }),
      topProductos: topProducts.flatMap((row) => {
        const product = productMap.get(row.productoId);
        if (!product) return [];
        return [
          {
            producto: {
              id: product.id,
              codigo: product.codigoProducto,
              nombre: product.nombre,
            },
            unidadesSolicitadas: row._sum.cantidadSolicitada ?? 0,
            montoNeto: money(row._sum.subtotal ?? 0),
          },
        ];
      }),
    };
  }

  private buildWhere(filters: OrderListFilters): Prisma.PedidoWhereInput {
    const search = filters.search?.trim();
    const stateFilter = filters.soloAbiertos
      ? { notIn: ['CANCELADO', 'ENTREGADO'] as OrderState[] }
      : filters.estado;

    return {
      empresaId: filters.empresaId,
      ...(stateFilter ? { estado: stateFilter } : {}),
      ...(filters.estadoPago ? { estadoPago: filters.estadoPago } : {}),
      ...(filters.condicionPago
        ? { condicionPago: filters.condicionPago }
        : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.vendedorId ? { vendedorId: filters.vendedorId } : {}),
      ...(filters.visitaId ? { visitaId: filters.visitaId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { numero: { contains: search, mode: 'insensitive' } },
              {
                cliente: {
                  is: {
                    OR: [
                      { nombre: { contains: search, mode: 'insensitive' } },
                      { apellido: { contains: search, mode: 'insensitive' } },
                      { telefono: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                vendedor: {
                  is: {
                    OR: [
                      { nombre: { contains: search, mode: 'insensitive' } },
                      { correo: { contains: search, mode: 'insensitive' } },
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
                          { nombre: { contains: search, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
              },
              { observaciones: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildSummaryWhere(
    filters: OrderSummaryFilters,
  ): Prisma.PedidoWhereInput {
    return {
      empresaId: filters.empresaId,
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.estadoPago ? { estadoPago: filters.estadoPago } : {}),
      ...(filters.condicionPago
        ? { condicionPago: filters.condicionPago }
        : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.vendedorId ? { vendedorId: filters.vendedorId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };
  }

  private orderBy(
    filters: OrderListFilters,
  ): Prisma.PedidoOrderByWithRelationInput[] {
    switch (filters.sortBy) {
      case 'numero':
        return [{ numero: filters.sortDir }, { id: 'desc' }];
      case 'estado':
        return [{ estado: filters.sortDir }, { id: 'desc' }];
      case 'estadoPago':
        return [{ estadoPago: filters.sortDir }, { id: 'desc' }];
      case 'cliente':
        return [{ cliente: { nombre: filters.sortDir } }, { id: 'desc' }];
      case 'vendedor':
        return [{ vendedor: { nombre: filters.sortDir } }, { id: 'desc' }];
      case 'total':
        return [{ total: filters.sortDir }, { id: 'desc' }];
      case 'actualizadoEn':
        return [{ actualizadoEn: filters.sortDir }, { id: 'desc' }];
      default:
        return [{ creadoEn: filters.sortDir }, { id: 'desc' }];
    }
  }

  private toListItem(
    row: any,
    paymentSummary?: {
      cantidad: number;
      registrado: Prisma.Decimal;
      verificado: Prisma.Decimal;
    },
  ): OrderListItemView {
    const summary = paymentSummary ?? {
      cantidad: 0,
      registrado: new Prisma.Decimal(0),
      verificado: new Prisma.Decimal(0),
    };
    const registered = summary.registrado;
    const verified = summary.verificado;
    const pendingRaw = new Prisma.Decimal(row.total).minus(verified);
    const pending = pendingRaw.isNegative()
      ? new Prisma.Decimal(0)
      : pendingRaw;
    const latestCredit = row.solicitudesCredito?.[0] ?? null;
    const latestDispatch = row.ordenesDespacho?.[0] ?? null;
    const latestDelivery = row.entregas?.[0] ?? null;
    const latestInvoice = row.facturas?.[0] ?? null;

    return {
      id: row.id,
      numero: row.numero ?? formatLegacyOrderNumber(row.id),
      estado: row.estado as OrderState,
      condicionPago: row.condicionPago as OrderPaymentCondition,
      estadoPago: row.estadoPago as OrderPaymentState,
      cliente: this.customer(row.cliente),
      vendedor: this.user(row.vendedor),
      visita: row.visita
        ? {
            id: row.visita.id,
            inicio: row.visita.inicio,
            fin: row.visita.fin,
            estado: String(row.visita.estadoVisita),
          }
        : null,
      progreso: this.progress(row.detalles),
      subtotal: money(row.subtotal),
      descuentoTotal: money(row.descuentoTotal),
      total: money(row.total),
      moneda: row.moneda,
      credito: latestCredit
        ? {
            solicitudId: latestCredit.id,
            estado: String(latestCredit.estado),
            montoSolicitado: money(latestCredit.montoSolicitado),
          }
        : null,
      despacho: latestDispatch ? this.latestDispatch(latestDispatch) : null,
      entrega: latestDelivery
        ? {
            id: latestDelivery.id,
            estado: String(latestDelivery.estado),
            entregadoEn: latestDelivery.entregadoEn,
          }
        : null,
      pagos: {
        cantidad: summary.cantidad,
        montoRegistrado: money(registered),
        montoVerificado: money(verified),
        montoPendienteEstimado: money(pending),
      },
      factura: latestInvoice
        ? {
            id: latestInvoice.id,
            estado: String(latestInvoice.estado),
            serie: latestInvoice.serie,
            numero: latestInvoice.numero,
            total: money(latestInvoice.total),
            emitidaEn: latestInvoice.emitidaEn,
          }
        : null,
      observaciones: row.observaciones,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }

  private async paymentSummaries(orderIds: number[]) {
    const result = new Map<
      number,
      {
        cantidad: number;
        registrado: Prisma.Decimal;
        verificado: Prisma.Decimal;
      }
    >();

    if (orderIds.length === 0) return result;

    const [registeredRows, verifiedRows] = await Promise.all([
      this.prisma.pago.groupBy({
        by: ['pedidoId'],
        where: {
          pedidoId: {
            in: orderIds,
          },
        },
        _count: {
          _all: true,
        },
        _sum: {
          monto: true,
        },
      }),

      this.prisma.pago.groupBy({
        by: ['pedidoId'],
        where: {
          pedidoId: {
            in: orderIds,
          },
          estado: 'VERIFICADO',
        },
        _sum: {
          monto: true,
        },
      }),
    ]);

    for (const row of registeredRows) {
      if (row.pedidoId == null) continue;
      result.set(row.pedidoId, {
        cantidad: row._count._all,
        registrado: new Prisma.Decimal(row._sum.monto ?? 0),
        verificado: new Prisma.Decimal(0),
      });
    }

    for (const row of verifiedRows) {
      if (row.pedidoId == null) continue;
      const current = result.get(row.pedidoId) ?? {
        cantidad: 0,
        registrado: new Prisma.Decimal(0),
        verificado: new Prisma.Decimal(0),
      };
      current.verificado = new Prisma.Decimal(row._sum.monto ?? 0);
      result.set(row.pedidoId, current);
    }

    return result;
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

  private user(row: any) {
    return {
      id: row.id,
      nombre: row.nombre,
      correo: row.correo,
      rol: String(row.rol),
    };
  }

  private latestDispatch(row: any) {
    return {
      ordenId: row.id,
      estado: String(row.estado),
      bodega: {
        id: row.bodega.id,
        codigo: row.bodega.codigo,
        nombre: row.bodega.nombre,
      },
      preparadoPor: row.preparadoPor ? this.user(row.preparadoPor) : null,
      preparadoEn: row.preparadoEn,
      despachadoEn: row.despachadoEn,
    };
  }

  private toDetailLine(detail: any) {
    const requested = detail.cantidadSolicitada;
    return {
      id: detail.id,
      producto: {
        id: detail.producto.id,
        codigo: detail.producto.codigoProducto,
        nombre: detail.producto.nombre,
      },
      cantidadSolicitada: requested,
      cantidadReservada: detail.cantidadReservada,
      cantidadDespachada: detail.cantidadDespachada,
      cantidadEntregada: detail.cantidadEntregada,
      cantidadPendienteReserva: Math.max(
        requested - detail.cantidadReservada - detail.cantidadDespachada,
        0,
      ),
      cantidadPendienteDespacho: Math.max(
        requested - detail.cantidadDespachada,
        0,
      ),
      cantidadPendienteEntrega: Math.max(
        detail.cantidadDespachada - detail.cantidadEntregada,
        0,
      ),
      porcentajeReservado: roundPercent(detail.cantidadReservada, requested),
      porcentajeDespachado: roundPercent(detail.cantidadDespachada, requested),
      porcentajeEntregado: roundPercent(detail.cantidadEntregada, requested),
      precioUnitario: money(detail.precioUnitario),
      descuento: money(detail.descuento),
      subtotal: money(detail.subtotal),
      observaciones: detail.observaciones,
      version: detail.version,
    };
  }

  private progress(details: any[]): OrderProgressView {
    const totals = details.reduce(
      (acc, detail) => ({
        productos: acc.productos + 1,
        solicitadas: acc.solicitadas + detail.cantidadSolicitada,
        reservadas: acc.reservadas + detail.cantidadReservada,
        despachadas: acc.despachadas + detail.cantidadDespachada,
        entregadas: acc.entregadas + detail.cantidadEntregada,
      }),
      {
        productos: 0,
        solicitadas: 0,
        reservadas: 0,
        despachadas: 0,
        entregadas: 0,
      },
    );
    return {
      productos: totals.productos,
      unidadesSolicitadas: totals.solicitadas,
      unidadesReservadas: totals.reservadas,
      unidadesDespachadas: totals.despachadas,
      unidadesEntregadas: totals.entregadas,
      unidadesPendientesReserva: Math.max(
        totals.solicitadas - totals.reservadas - totals.despachadas,
        0,
      ),
      unidadesPendientesDespacho: Math.max(
        totals.solicitadas - totals.despachadas,
        0,
      ),
      unidadesPendientesEntrega: Math.max(
        totals.despachadas - totals.entregadas,
        0,
      ),
      porcentajeReservado: roundPercent(totals.reservadas, totals.solicitadas),
      porcentajeDespachado: roundPercent(
        totals.despachadas,
        totals.solicitadas,
      ),
      porcentajeEntregado: roundPercent(totals.entregadas, totals.solicitadas),
    };
  }

  private toEvent(row: any): OrderEventView {
    return {
      id: row.id,
      tipo: row.tipo as OrderEventType,
      detalle: row.detalle,
      actor: row.usuario ? this.user(row.usuario) : null,
      referencia:
        row.referenciaTipo && row.referenciaId
          ? { tipo: row.referenciaTipo, id: row.referenciaId }
          : null,
      creadoEn: row.creadoEn,
    };
  }

  private actions(
    state: OrderState,
    condition: OrderPaymentCondition,
  ): OrderActionsView {
    const requiresCredit = ['CREDITO', 'MIXTO'].includes(condition);
    return {
      puedeEditar: state === 'BORRADOR',
      puedeSolicitarValidacion: state === 'BORRADOR',
      puedeConfirmar: state === 'PENDIENTE_VALIDACION' && !requiresCredit,
      puedeCancelar: ['BORRADOR', 'PENDIENTE_VALIDACION'].includes(state),
      requiereCredito: requiresCredit,
    };
  }

  private stateCounters(rows: any[]): Record<OrderState, number> {
    const result: Record<OrderState, number> = {
      BORRADOR: 0,
      PENDIENTE_VALIDACION: 0,
      CONFIRMADO: 0,
      EN_PREPARACION: 0,
      PARCIALMENTE_DESPACHADO: 0,
      DESPACHADO: 0,
      PARCIALMENTE_ENTREGADO: 0,
      ENTREGADO: 0,
      CANCELADO: 0,
    };
    for (const row of rows) result[row.estado as OrderState] = row._count._all;
    return result;
  }

  private paymentCounters(rows: any[]): Record<OrderPaymentState, number> {
    const result: Record<OrderPaymentState, number> = {
      PENDIENTE: 0,
      PARCIAL: 0,
      PAGADO: 0,
      REEMBOLSADO: 0,
      ANULADO: 0,
    };
    for (const row of rows)
      result[row.estadoPago as OrderPaymentState] = row._count._all;
    return result;
  }

  private conditionCounters(
    rows: any[],
  ): Record<OrderPaymentCondition, number> {
    const result: Record<OrderPaymentCondition, number> = {
      PREPAGO: 0,
      CONTRAENTREGA: 0,
      CREDITO: 0,
      MIXTO: 0,
    };
    for (const row of rows)
      result[row.condicionPago as OrderPaymentCondition] = row._count._all;
    return result;
  }
}

function roundPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 10000) / 100;
}

function formatLegacyOrderNumber(id: number): string {
  return `PED-${String(id).padStart(6, '0')}`;
}
