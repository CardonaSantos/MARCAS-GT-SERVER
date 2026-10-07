import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import {
  CreditApplicationListItemView,
  CreditDetailView,
  CreditEventFilters,
  CreditEventView,
  CreditListFilters,
  CreditPolicyView,
  CreditPortfolioFilters,
  CreditPortfolioItemView,
  CreditPortfolioDetailView,
  CreditScope,
  CreditSummaryFilters,
  CreditSummaryView,
  UserView,
} from '../../../application/models/credit.models';
import { CreditQueryPort } from '../../../application/ports/credit-query.port';
import {
  CreditApplicationState,
  CreditDecisionType,
  CreditEventType,
  CreditIntegrationState,
} from '../../../credit.types';

const userSelect = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
} satisfies Prisma.UsuarioSelect;

const listInclude = {
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
  solicitante: { select: userSelect },
  politica: { select: { id: true, nombre: true } },
  pedido: {
    include: {
      vendedor: { select: userSelect },
      visita: {
        select: {
          id: true,
          inicio: true,
          fin: true,
          estadoVisita: true,
        },
      },
    },
  },
  decision: {
    include: { decididoPor: { select: userSelect } },
  },
  credito: {
    include: { aprobadoPor: { select: userSelect } },
  },
  operacionPedido: { include: { actor: { select: userSelect } } },
  eventos: {
    orderBy: [{ creadoEn: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    include: { usuario: { select: userSelect } },
  },
  _count: {
    select: {
      requisitos: true,
      referencias: true,
      documentos: true,
    },
  },
} satisfies Prisma.SolicitudCreditoInclude;

type ListRow = Prisma.SolicitudCreditoGetPayload<{
  include: typeof listInclude;
}>;

@Injectable()
export class CreditPrismaQueryAdapter implements CreditQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: CreditListFilters) {
    const where = this.buildWhere(filters);
    const skip = (filters.page - 1) * filters.limit;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.solicitudCredito.count({ where }),
      this.prisma.solicitudCredito.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: this.orderBy(filters),
        include: listInclude,
      }),
    ]);

    const ids = rows.map((r) => r.id);
    const orderIds = rows.map((r) => r.pedidoId);
    const creditIds = rows.flatMap((r) => (r.creditoId ? [r.creditoId] : []));

    const [requirementGroups, referenceGroups, documentGroups, paymentsRegistered, paymentsVerified, accountGroups] =
      await Promise.all([
        ids.length
          ? this.prisma.solicitudCreditoRequisito.groupBy({
              by: ['solicitudId', 'estado'],
              where: { solicitudId: { in: ids } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        ids.length
          ? this.prisma.referenciaCredito.groupBy({
              by: ['solicitudId', 'resultado'],
              where: { solicitudId: { in: ids } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        ids.length
          ? this.prisma.documentoCredito.groupBy({
              by: ['solicitudId', 'estado'],
              where: { solicitudId: { in: ids } },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        orderIds.length
          ? this.prisma.pago.groupBy({
              by: ['pedidoId'],
              where: { pedidoId: { in: orderIds } },
              _count: { _all: true },
              _sum: { monto: true },
              _max: { fechaPago: true },
            })
          : Promise.resolve([]),
        orderIds.length
          ? this.prisma.pago.groupBy({
              by: ['pedidoId'],
              where: {
                pedidoId: { in: orderIds },
                estado: 'VERIFICADO',
              },
              _sum: { monto: true },
              _max: { fechaPago: true },
            })
          : Promise.resolve([]),
        creditIds.length
          ? this.prisma.cuentaPorCobrar.groupBy({
              by: ['creditoId', 'estado'],
              where: { creditoId: { in: creditIds } },
              _count: { _all: true },
              _sum: { montoOriginal: true, saldoPendiente: true },
            })
          : Promise.resolve([]),
      ]);

    const reqMap = groupedCount(requirementGroups, 'solicitudId', 'estado');
    const refMap = groupedCount(referenceGroups, 'solicitudId', 'resultado');
    const docMap = groupedCount(documentGroups, 'solicitudId', 'estado');
    const regMap = new Map<number, any>(
      paymentsRegistered.flatMap((g: any) => (g.pedidoId ? [[g.pedidoId, g]] : [])),
    );
    const verMap = new Map<number, any>(
      paymentsVerified.flatMap((g: any) => (g.pedidoId ? [[g.pedidoId, g]] : [])),
    );
    const accountMap = accountSummaryMap(accountGroups);

    return {
      data: rows.map((row) =>
        this.toListItem(
          row,
          reqMap.get(row.id) ?? {},
          refMap.get(row.id) ?? {},
          docMap.get(row.id) ?? {},
          regMap.get(row.pedidoId),
          verMap.get(row.pedidoId),
          row.creditoId ? accountMap.get(row.creditoId) : undefined,
        ),
      ),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getById(id: number, scope: CreditScope): Promise<CreditDetailView | null> {
    const row = await this.prisma.solicitudCredito.findFirst({
      where: {
        id,
        empresaId: scope.empresaId,
        ...(scope.vendedorId
          ? { pedido: { is: { vendedorId: scope.vendedorId } } }
          : {}),
      },
      include: {
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
        solicitante: { select: userSelect },
        politica: { select: { id: true, nombre: true } },
        pedido: {
          include: {
            vendedor: { select: userSelect },
            visita: {
              select: {
                id: true,
                inicio: true,
                fin: true,
                estadoVisita: true,
              },
            },
            pagos: {
              orderBy: { fechaPago: 'desc' },
              take: 30,
              include: { registradoPor: { select: userSelect } },
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
          },
        },
        requisitos: {
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          include: { revisadoPor: { select: userSelect } },
        },
        referencias: {
          orderBy: { creadoEn: 'asc' },
          include: { verificadoPor: { select: userSelect } },
        },
        documentos: {
          orderBy: { creadoEn: 'asc' },
          include: { revisadoPor: { select: userSelect } },
        },
        decision: { include: { decididoPor: { select: userSelect } } },
        credito: {
          include: {
            aprobadoPor: { select: userSelect },
            cuentasPorCobrar: {
              orderBy: { fechaEmision: 'desc' },
              include: { aplicaciones: { select: { monto: true } } },
            },
          },
        },
        operacionPedido: { include: { actor: { select: userSelect } } },
        eventos: {
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          take: 30,
          include: { usuario: { select: userSelect } },
        },
      },
    });

    if (!row) return null;

    const requirementCounts = countsFromRows(row.requisitos, 'estado');
    const referenceCounts = countsFromRows(row.referencias, 'resultado');
    const documentCounts = countsFromRows(row.documentos, 'estado');
    const registered = row.pedido.pagos.reduce(
      (acc, p) => acc.plus(p.monto),
      new Prisma.Decimal(0),
    );
    const verified = row.pedido.pagos
      .filter((p) => p.estado === 'VERIFICADO')
      .reduce((acc, p) => acc.plus(p.monto), new Prisma.Decimal(0));

    let accountOriginal = new Prisma.Decimal(0);
    let accountPending = new Prisma.Decimal(0);
    let overdue = 0;
    for (const account of row.credito?.cuentasPorCobrar ?? []) {
      accountOriginal = accountOriginal.plus(account.montoOriginal);
      accountPending = accountPending.plus(account.saldoPendiente);
      if (account.estado === 'VENCIDA') overdue += 1;
    }

    const listBase = this.toListItem(
      row as any,
      requirementCounts,
      referenceCounts,
      documentCounts,
      {
        _count: { _all: row.pedido.pagos.length },
        _sum: { monto: registered },
        _max: { fechaPago: row.pedido.pagos[0]?.fechaPago ?? null },
      },
      {
        _sum: { monto: verified },
        _max: {
          fechaPago:
            row.pedido.pagos.find((p) => p.estado === 'VERIFICADO')?.fechaPago ??
            null,
        },
      },
      {
        cantidad: row.credito?.cuentasPorCobrar.length ?? 0,
        montoOriginal: accountOriginal,
        saldoPendiente: accountPending,
        vencidas: overdue,
      },
    );

    return {
      ...listBase,
      version: row.version,
      requisitos: row.requisitos.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        descripcion: r.descripcion,
        obligatorio: r.obligatorio,
        estado: String(r.estado),
        observaciones: r.observaciones,
        revisadoPor: r.revisadoPor ? this.user(r.revisadoPor) : null,
        revisadoEn: r.revisadoEn,
        creadoEn: r.creadoEn,
        actualizadoEn: r.actualizadoEn,
      })),
      referencias: row.referencias.map((r) => ({
        id: r.id,
        tipo: String(r.tipo),
        nombre: r.nombre,
        telefono: r.telefono,
        relacion: r.relacion,
        resultado: String(r.resultado),
        observaciones: r.observaciones,
        verificadoPor: r.verificadoPor ? this.user(r.verificadoPor) : null,
        verificadoEn: r.verificadoEn,
        creadoEn: r.creadoEn,
        actualizadoEn: r.actualizadoEn,
      })),
      documentos: row.documentos.map((d) => ({
        id: d.id,
        tipo: String(d.tipo),
        url: d.url,
        key: d.key,
        mimeType: d.mimeType,
        size: d.size,
        estado: String(d.estado),
        observaciones: d.observaciones,
        revisadoPor: d.revisadoPor ? this.user(d.revisadoPor) : null,
        revisadoEn: d.revisadoEn,
        creadoEn: d.creadoEn,
        actualizadoEn: d.actualizadoEn,
      })),
      cuentas: (row.credito?.cuentasPorCobrar ?? []).map((a) => ({
        id: a.id,
        numeroDocumento: a.numeroDocumento,
        montoOriginal: money(a.montoOriginal),
        saldoPendiente: money(a.saldoPendiente),
        estado: String(a.estado),
        fechaEmision: a.fechaEmision,
        fechaVencimiento: a.fechaVencimiento,
        aplicado: money(
          a.aplicaciones.reduce(
            (acc, item) => acc.plus(item.monto),
            new Prisma.Decimal(0),
          ),
        ),
      })),
      pagosDetalle: row.pedido.pagos.map((p) => ({
        id: p.id,
        metodo: String(p.metodo),
        estado: String(p.estado),
        monto: money(p.monto),
        referencia: p.referencia,
        fechaPago: p.fechaPago,
        verificadoEn: p.verificadoEn,
        registradoPor: p.registradoPor ? this.user(p.registradoPor) : null,
      })),
      facturas: row.pedido.facturas.map((f) => ({
        id: f.id,
        estado: String(f.estado),
        serie: f.serie,
        numero: f.numero,
        total: money(f.total),
        emitidaEn: f.emitidaEn,
        fechaVencimiento: f.fechaVencimiento,
      })),
      ultimosEventos: row.eventos.map((e) => this.event(e)),
      acciones: actionsFor(row.estado as CreditApplicationState, scope.role, row.operacionPedido?.estado),
    };
  }

  async listEvents(id: number, filters: CreditEventFilters) {
    const where: Prisma.SolicitudCreditoEventoWhereInput = {
      solicitudId: id,
      solicitud: {
        is: {
          empresaId: filters.empresaId,
          ...(filters.vendedorId
            ? { pedido: { is: { vendedorId: filters.vendedorId } } }
            : {}),
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
      this.prisma.solicitudCreditoEvento.count({ where }),
      this.prisma.solicitudCreditoEvento.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        include: { usuario: { select: userSelect } },
      }),
    ]);
    return {
      data: rows.map((r) => this.event(r)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getSummary(filters: CreditSummaryFilters): Promise<CreditSummaryView> {
    const where = this.buildSummaryWhere(filters);

    const [aggregate, byState, decisions, credits, integrations, accounts, appliedPayments, byApplicant, byCustomer, byPolicy] =
      await Promise.all([
        this.prisma.solicitudCredito.aggregate({
          where,
          _count: { _all: true },
          _sum: { montoSolicitado: true },
          _avg: { plazoDias: true },
        }),
        this.prisma.solicitudCredito.groupBy({
          by: ['estado'],
          where,
          _count: { _all: true },
        }),
        this.prisma.decisionCredito.aggregate({
          where: { solicitud: { is: where } },
          _sum: { montoAutorizado: true, anticipoRequerido: true },
          _avg: { plazoAutorizadoDias: true },
        }),
        this.prisma.credito.aggregate({
          where: { solicitudOrigen: { is: where } },
          _sum: { montoFinanciado: true },
        }),
        this.prisma.operacionIntegracionCreditoPedido.groupBy({
          by: ['estado'],
          where: { solicitud: { is: where } },
          _count: { _all: true },
        }),
        this.prisma.cuentaPorCobrar.aggregate({
          where: {
            credito: { is: { solicitudOrigen: { is: where } } },
          },
          _sum: { montoOriginal: true, saldoPendiente: true },
        }),
        this.prisma.pagoAplicacion.aggregate({
          where: {
            cuentaPorCobrar: {
              is: { credito: { is: { solicitudOrigen: { is: where } } } },
            },
          },
          _sum: { monto: true },
        }),
        this.prisma.solicitudCredito.groupBy({
          by: ['solicitanteId'],
          where,
          _count: { _all: true },
          _sum: { montoSolicitado: true },
          orderBy: { _sum: { montoSolicitado: 'desc' } },
          take: 10,
        }),
        this.prisma.solicitudCredito.groupBy({
          by: ['clienteId'],
          where,
          _count: { _all: true },
          _sum: { montoSolicitado: true },
          orderBy: { _sum: { montoSolicitado: 'desc' } },
          take: 10,
        }),
        this.prisma.solicitudCredito.groupBy({
          by: ['politicaId'],
          where: { ...where, ...(filters.politicaId ? {} : { politicaId: { not: null } }) },
          _count: { _all: true },
          _sum: { montoSolicitado: true },
          orderBy: { _sum: { montoSolicitado: 'desc' } },
          take: 10,
        }),
      ]);

    const applicantIds = byApplicant.map((r) => r.solicitanteId);
    const customerIds = byCustomer.map((r) => r.clienteId);
    const policyIds = byPolicy.flatMap((r) => (r.politicaId ? [r.politicaId] : []));
    const [users, customers, policies] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { id: { in: applicantIds } },
        select: userSelect,
      }),
      this.prisma.cliente.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, nombre: true, apellido: true },
      }),
      this.prisma.politicaCredito.findMany({
        where: { id: { in: policyIds } },
        select: { id: true, nombre: true },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const policyMap = new Map(policies.map((p) => [p.id, p]));
    const states = stateCounters(byState);
    const resolved = states.APROBADA + states.RECHAZADA;

    return {
      totalSolicitudes: aggregate._count._all,
      porEstado: states,
      montos: {
        solicitado: money(aggregate._sum.montoSolicitado ?? 0),
        autorizado: money(decisions._sum.montoAutorizado ?? 0),
        anticipoRequerido: money(decisions._sum.anticipoRequerido ?? 0),
        financiado: money(credits._sum.montoFinanciado ?? 0),
        cuentasOriginal: money(accounts._sum.montoOriginal ?? 0),
        cuentasPendiente: money(accounts._sum.saldoPendiente ?? 0),
        pagadoAplicado: money(appliedPayments._sum.monto ?? 0),
      },
      promedios: {
        plazoSolicitadoDias:
          aggregate._avg.plazoDias == null
            ? null
            : round2(aggregate._avg.plazoDias),
        plazoAutorizadoDias:
          decisions._avg.plazoAutorizadoDias == null
            ? null
            : round2(decisions._avg.plazoAutorizadoDias),
        porcentajeAprobacion:
          resolved === 0 ? 0 : round2((states.APROBADA / resolved) * 100),
      },
      integraciones: {
        pendientes: integrationCount(integrations, 'PENDIENTE'),
        aplicadas: integrationCount(integrations, 'APLICADA'),
        fallidas: integrationCount(integrations, 'FALLIDA'),
      },
      topSolicitantes: byApplicant.flatMap((r) => {
        const u = userMap.get(r.solicitanteId);
        return u
          ? [
              {
                usuario: this.user(u),
                solicitudes: r._count._all,
                montoSolicitado: money(r._sum.montoSolicitado ?? 0),
              },
            ]
          : [];
      }),
      topClientes: byCustomer.flatMap((r) => {
        const c = customerMap.get(r.clienteId);
        return c
          ? [
              {
                cliente: {
                  id: c.id,
                  nombre: c.nombre,
                  apellido: c.apellido,
                  nombreCompleto: [c.nombre, c.apellido].filter(Boolean).join(' '),
                },
                solicitudes: r._count._all,
                montoSolicitado: money(r._sum.montoSolicitado ?? 0),
              },
            ]
          : [];
      }),
      topPoliticas: byPolicy.flatMap((r) => {
        if (!r.politicaId) return [];
        const p = policyMap.get(r.politicaId);
        return p
          ? [
              {
                politica: p,
                solicitudes: r._count._all,
                montoSolicitado: money(r._sum.montoSolicitado ?? 0),
              },
            ]
          : [];
      }),
    };
  }

  async listPortfolio(filters: CreditPortfolioFilters) {
    const search = filters.search?.trim();
    const where: Prisma.CreditoWhereInput = {
      empresaId: filters.empresaId,
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            aprobadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filters.conSaldoPendiente
        ? {
            cuentasPorCobrar: {
              some: { saldoPendiente: { gt: 0 } },
            },
          }
        : {}),
      AND: [
        {
          solicitudOrigen: {
            is: {
              empresaId: filters.empresaId,
              ...(filters.vendedorId
                ? { pedido: { is: { vendedorId: filters.vendedorId } } }
                : {}),
            },
          },
        },
        ...(search
          ? [
              {
                OR: [
                  { numero: { contains: search, mode: 'insensitive' as const } },
                  {
                    cliente: {
                      is: {
                        OR: [
                          { nombre: { contains: search, mode: 'insensitive' as const } },
                          { apellido: { contains: search, mode: 'insensitive' as const } },
                          { telefono: { contains: search, mode: 'insensitive' as const } },
                        ],
                      },
                    },
                  },
                  {
                    solicitudOrigen: {
                      is: {
                        OR: [
                          { numero: { contains: search, mode: 'insensitive' as const } },
                          { pedido: { is: { numero: { contains: search, mode: 'insensitive' as const } } } },
                        ],
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.credito.count({ where }),
      this.prisma.credito.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ aprobadoEn: 'desc' }, { id: 'desc' }],
        include: {
          aprobadoPor: { select: userSelect },
          solicitudOrigen: {
            include: {
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
              pedido: {
                include: { vendedor: { select: userSelect } },
              },
            },
          },
          cuentasPorCobrar: {
            select: {
              id: true,
              estado: true,
              montoOriginal: true,
              saldoPendiente: true,
              fechaVencimiento: true,
              aplicaciones: { select: { monto: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: rows.flatMap((row): CreditPortfolioItemView[] => {
        const application = row.solicitudOrigen;
        if (
          !application ||
          row.montoAutorizado == null ||
          row.anticipoRequerido == null ||
          row.montoFinanciado == null ||
          row.plazoAutorizadoDias == null
        ) {
          return [];
        }

        let original = new Prisma.Decimal(0);
        let pending = new Prisma.Decimal(0);
        let applied = new Prisma.Decimal(0);
        let overdue = 0;
        let nextDue: Date | null = null;

        for (const account of row.cuentasPorCobrar) {
          original = original.plus(account.montoOriginal);
          pending = pending.plus(account.saldoPendiente);
          applied = applied.plus(
            account.aplicaciones.reduce(
              (acc, item) => acc.plus(item.monto),
              new Prisma.Decimal(0),
            ),
          );
          if (account.estado === 'VENCIDA') overdue += 1;
          if (
            account.saldoPendiente.gt(0) &&
            (!nextDue || account.fechaVencimiento < nextDue)
          ) {
            nextDue = account.fechaVencimiento;
          }
        }

        return [
          {
            id: row.id,
            numero: row.numero ?? `CRE-${String(row.id).padStart(6, '0')}`,
            estado: String(row.estado),
            solicitud: {
              id: application.id,
              numero:
                application.numero ??
                `SOL-${String(application.id).padStart(6, '0')}`,
              estado: application.estado as CreditApplicationState,
            },
            pedido: {
              id: application.pedido.id,
              numero:
                application.pedido.numero ??
                `PED-${String(application.pedido.id).padStart(6, '0')}`,
              estado: String(application.pedido.estado),
              condicionPago: String(application.pedido.condicionPago),
              total: money(application.pedido.total),
            },
            cliente: {
              id: application.cliente.id,
              nombre: application.cliente.nombre,
              apellido: application.cliente.apellido,
              nombreCompleto: [
                application.cliente.nombre,
                application.cliente.apellido,
              ]
                .filter(Boolean)
                .join(' '),
              telefono: application.cliente.telefono,
              correo: application.cliente.correo,
              direccion: application.cliente.direccion,
            },
            vendedor: this.user(application.pedido.vendedor),
            aprobadoPor: row.aprobadoPor ? this.user(row.aprobadoPor) : null,
            montos: {
              autorizado: money(row.montoAutorizado),
              anticipoRequerido: money(row.anticipoRequerido),
              financiado: money(row.montoFinanciado),
              cuentaOriginal: money(original),
              saldoPendiente:
                row.cuentasPorCobrar.length > 0 ? money(pending) : null,
              pagadoAplicado: money(applied),
            },
            plazoAutorizadoDias: row.plazoAutorizadoDias,
            cuentas: {
              cantidad: row.cuentasPorCobrar.length,
              vencidas: overdue,
              proximoVencimiento: nextDue,
            },
            aprobadoEn: row.aprobadoEn,
            cerradoEn: row.cerradoEn,
            creadoEn: row.createdAt,
            actualizadoEn: row.updatedAt,
          },
        ];
      }),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getPortfolioById(
    id: number,
    scope: CreditScope,
  ): Promise<CreditPortfolioDetailView | null> {
    const row = await this.prisma.credito.findFirst({
      where: {
        id,
        empresaId: scope.empresaId,
        solicitudOrigen: {
          is: {
            empresaId: scope.empresaId,
            ...(scope.vendedorId
              ? { pedido: { is: { vendedorId: scope.vendedorId } } }
              : {}),
          },
        },
      },
      include: {
        aprobadoPor: { select: userSelect },
        solicitudOrigen: {
          include: {
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
            pedido: {
              include: {
                vendedor: { select: userSelect },
                facturas: {
                  orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
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
              },
            },
          },
        },
        planPago: {
          include: {
            cuotas: {
              orderBy: [{ numero: 'asc' }],
              include: {
                cuentaPorCobrar: {
                  select: {
                    id: true,
                    estado: true,
                    montoOriginal: true,
                    saldoPendiente: true,
                    fechaEmision: true,
                    fechaVencimiento: true,
                  },
                },
              },
            },
            eventos: {
              orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
              take: 50,
              include: { usuario: { select: userSelect } },
            },
          },
        },
        cuentasPorCobrar: {
          orderBy: [{ fechaVencimiento: 'asc' }, { id: 'asc' }],
          include: {
            cuotaCredito: { select: { numero: true } },
            aplicaciones: {
              where: { estado: 'ACTIVA' },
              select: { monto: true },
            },
          },
        },
      },
    });

    if (
      !row ||
      !row.solicitudOrigen ||
      row.montoAutorizado == null ||
      row.anticipoRequerido == null ||
      row.montoFinanciado == null ||
      row.plazoAutorizadoDias == null
    ) {
      return null;
    }

    const application = row.solicitudOrigen;
    const order = application.pedido;

    const payments = await this.prisma.pago.findMany({
      where: {
        empresaId: scope.empresaId,
        clienteId: application.clienteId,
        OR: [
          { pedidoId: order.id },
          {
            aplicaciones: {
              some: {
                estado: 'ACTIVA',
                cuentaPorCobrar: { creditoId: row.id },
              },
            },
          },
        ],
      },
      orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
      take: 100,
      include: {
        aplicaciones: {
          where: { estado: 'ACTIVA' },
          select: {
            monto: true,
            cuentaPorCobrar: { select: { creditoId: true } },
          },
        },
      },
    });

    const verified = payments
      .filter((payment) => payment.estado === 'VERIFICADO')
      .reduce(
        (total, payment) => total.plus(payment.monto),
        new Prisma.Decimal(0),
      );

    const applied = row.cuentasPorCobrar.reduce(
      (total, account) =>
        total.plus(
          account.aplicaciones.reduce(
            (subtotal, item) => subtotal.plus(item.monto),
            new Prisma.Decimal(0),
          ),
        ),
      new Prisma.Decimal(0),
    );

    const pending =
      row.cuentasPorCobrar.length > 0
        ? row.cuentasPorCobrar.reduce(
            (total, account) => total.plus(account.saldoPendiente),
            new Prisma.Decimal(0),
          )
        : null;

    const manager = ['ADMIN', 'CONTABILIDAD'].includes(scope.role);
    const plan = row.planPago;

    return {
      id: row.id,
      numero: row.numero ?? `CRE-${String(row.id).padStart(6, '0')}`,
      estado: String(row.estado),
      cliente: {
        id: application.cliente.id,
        nombre: application.cliente.nombre,
        apellido: application.cliente.apellido,
        nombreCompleto: [
          application.cliente.nombre,
          application.cliente.apellido,
        ]
          .filter(Boolean)
          .join(' '),
        telefono: application.cliente.telefono,
        correo: application.cliente.correo,
        direccion: application.cliente.direccion,
      },
      vendedor: this.user(order.vendedor),
      aprobadoPor: row.aprobadoPor ? this.user(row.aprobadoPor) : null,
      solicitud: {
        id: application.id,
        numero:
          application.numero ??
          `SOL-${String(application.id).padStart(6, '0')}`,
        estado: application.estado as CreditApplicationState,
      },
      pedido: {
        id: order.id,
        numero: order.numero ?? `PED-${String(order.id).padStart(6, '0')}`,
        estado: String(order.estado),
        condicionPago: String(order.condicionPago),
        estadoPago: String(order.estadoPago),
        moneda: order.moneda,
        total: money(order.total),
      },
      montos: {
        autorizado: money(row.montoAutorizado),
        anticipoRequerido: money(row.anticipoRequerido),
        financiado: money(row.montoFinanciado),
        pagadoVerificado: money(verified),
        pagadoAplicado: money(applied),
        saldoPendiente: pending ? money(pending) : null,
      },
      plazoAutorizadoDias: row.plazoAutorizadoDias,
      aprobadoEn: row.aprobadoEn,
      cerradoEn: row.cerradoEn,
      creadoEn: row.createdAt,
      actualizadoEn: row.updatedAt,
      planPago: plan
        ? {
            id: plan.id,
            estado: plan.estado as any,
            frecuencia: plan.frecuencia as any,
            montoProgramado: money(plan.montoProgramado),
            numeroCuotas: plan.numeroCuotas,
            primeraFechaVencimiento: plan.primeraFechaVencimiento,
            activadoEn: plan.activadoEn,
            version: plan.version,
            cuotas: plan.cuotas.map((cuota) => {
              const account = cuota.cuentaPorCobrar;
              const balance = account?.saldoPendiente ?? cuota.montoProgramado;
              const paid = cuota.montoProgramado.minus(balance);
              return {
                id: cuota.id,
                numero: cuota.numero,
                montoProgramado: money(cuota.montoProgramado),
                fechaVencimiento: cuota.fechaVencimiento,
                estado: account ? String(account.estado) : 'BORRADOR',
                cuentaPorCobrarId: cuota.cuentaPorCobrarId,
                montoPagado: money(paid),
                saldoPendiente: money(balance),
              };
            }),
            eventos: plan.eventos.map((event) => ({
              id: event.id,
              tipo: event.tipo as any,
              estado: event.estado as any,
              detalle: event.detalle,
              actor: event.usuario ? this.user(event.usuario) : null,
              creadoEn: event.creadoEn,
            })),
          }
        : null,
      cuentasPorCobrar: row.cuentasPorCobrar.map((account) => ({
        id: account.id,
        numeroDocumento: account.numeroDocumento,
        estado: String(account.estado),
        montoOriginal: money(account.montoOriginal),
        saldoPendiente: money(account.saldoPendiente),
        fechaEmision: account.fechaEmision,
        fechaVencimiento: account.fechaVencimiento,
        cuotaNumero: account.cuotaCredito?.numero ?? null,
      })),
      pagos: payments.map((payment) => {
        const appliedTotal = payment.aplicaciones.reduce(
          (total, item) => total.plus(item.monto),
          new Prisma.Decimal(0),
        );
        const available = payment.monto.minus(appliedTotal);
        return {
          id: payment.id,
          metodo: String(payment.metodo),
          estado: String(payment.estado),
          monto: money(payment.monto),
          montoAplicado: money(appliedTotal),
          montoDisponible: money(available),
          referencia: payment.referencia,
          fechaPago: payment.fechaPago,
          verificadoEn: payment.verificadoEn,
        };
      }),
      facturas: order.facturas.map((invoice) => ({
        id: invoice.id,
        estado: String(invoice.estado),
        serie: invoice.serie,
        numero: invoice.numero,
        total: money(invoice.total),
        emitidaEn: invoice.emitidaEn,
        fechaVencimiento: invoice.fechaVencimiento,
      })),
      acciones: {
        puedeGestionarPlan:
          manager && row.estado === 'ACTIVO' && (!plan || plan.estado === 'BORRADOR'),
        puedeActivarPlan:
          manager && row.estado === 'ACTIVO' && plan?.estado === 'BORRADOR',
      },
    };
  }

  async listPolicies(filters: {
    page: number;
    limit: number;
    search?: string;
    activo?: boolean;
    empresaId: number;
  }) {
    const where: Prisma.PoliticaCreditoWhereInput = {
      empresaId: filters.empresaId,
      ...(filters.activo !== undefined ? { activo: filters.activo } : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                nombre: {
                  contains: filters.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                descripcion: {
                  contains: filters.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.politicaCredito.count({ where }),
      this.prisma.politicaCredito.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ activo: 'desc' }, { actualizadoEn: 'desc' }],
        include: { requisitos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] } },
      }),
    ]);
    return {
      data: rows.map((r) => this.policy(r)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getPolicy(id: number, empresaId: number): Promise<CreditPolicyView | null> {
    const row = await this.prisma.politicaCredito.findFirst({
      where: { id, empresaId },
      include: { requisitos: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] } },
    });
    return row ? this.policy(row) : null;
  }

  private buildWhere(filters: CreditListFilters): Prisma.SolicitudCreditoWhereInput {
    const search = filters.search?.trim();
    const state = filters.soloPendientes
      ? ({ in: ['PENDIENTE', 'EN_REVISION'] } as const)
      : filters.estado;

    return {
      empresaId: filters.empresaId,
      ...(state ? { estado: state as any } : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.solicitanteId ? { solicitanteId: filters.solicitanteId } : {}),
      ...(filters.politicaId ? { politicaId: filters.politicaId } : {}),
      AND: [
        ...(filters.vendedorId
          ? [{ pedido: { is: { vendedorId: filters.vendedorId } } }]
          : []),
        ...(filters.condicionPago
          ? [{ pedido: { is: { condicionPago: filters.condicionPago } } }]
          : []),
        ...(filters.tipoDecision
          ? [{ decision: { is: { tipo: filters.tipoDecision } } }]
          : []),
        ...(filters.integracionEstado
          ? [{ operacionPedido: { is: { estado: filters.integracionEstado } } }]
          : []),
      ],
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            solicitadaEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { numero: { contains: search, mode: 'insensitive' } },
              { motivo: { contains: search, mode: 'insensitive' } },
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
                solicitante: {
                  is: {
                    OR: [
                      { nombre: { contains: search, mode: 'insensitive' } },
                      { correo: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                pedido: {
                  is: {
                    OR: [
                      { numero: { contains: search, mode: 'insensitive' } },
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
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildSummaryWhere(filters: CreditSummaryFilters): Prisma.SolicitudCreditoWhereInput {
    return {
      empresaId: filters.empresaId,
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.solicitanteId ? { solicitanteId: filters.solicitanteId } : {}),
      ...(filters.politicaId ? { politicaId: filters.politicaId } : {}),
      ...(filters.vendedorId
        ? { pedido: { is: { vendedorId: filters.vendedorId } } }
        : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            solicitadaEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };
  }

  private orderBy(filters: CreditListFilters): Prisma.SolicitudCreditoOrderByWithRelationInput[] {
    switch (filters.sortBy) {
      case 'numero':
        return [{ numero: filters.sortDir }, { id: 'desc' }];
      case 'estado':
        return [{ estado: filters.sortDir }, { id: 'desc' }];
      case 'cliente':
        return [{ cliente: { nombre: filters.sortDir } }, { id: 'desc' }];
      case 'vendedor':
        return [{ pedido: { vendedor: { nombre: filters.sortDir } } }, { id: 'desc' }];
      case 'solicitante':
        return [{ solicitante: { nombre: filters.sortDir } }, { id: 'desc' }];
      case 'montoSolicitado':
        return [{ montoSolicitado: filters.sortDir }, { id: 'desc' }];
      case 'plazoDias':
        return [{ plazoDias: filters.sortDir }, { id: 'desc' }];
      case 'actualizadoEn':
        return [{ actualizadoEn: filters.sortDir }, { id: 'desc' }];
      default:
        return [{ solicitadaEn: filters.sortDir }, { id: 'desc' }];
    }
  }

  private toListItem(
    row: ListRow | any,
    reqCounts: Record<string, number>,
    refCounts: Record<string, number>,
    docCounts: Record<string, number>,
    registered?: any,
    verified?: any,
    accounts?: {
      cantidad: number;
      montoOriginal: Prisma.Decimal;
      saldoPendiente: Prisma.Decimal;
      vencidas: number;
    },
  ): CreditApplicationListItemView {
    const decision = row.decision;
    const credit = row.credito;
    return {
      id: row.id,
      numero: row.numero ?? `SOL-${String(row.id).padStart(6, '0')}`,
      estado: row.estado as CreditApplicationState,
      origen: {
        tipo: 'PEDIDO',
        pedido: {
          id: row.pedido.id,
          numero: row.pedido.numero ?? `PED-${String(row.pedido.id).padStart(6, '0')}`,
          estado: String(row.pedido.estado),
          condicionPago: String(row.pedido.condicionPago),
          estadoPago: String(row.pedido.estadoPago),
          total: money(row.pedido.total),
          creadoEn: row.pedido.creadoEn,
        },
        visita: row.pedido.visita
          ? {
              id: row.pedido.visita.id,
              inicio: row.pedido.visita.inicio,
              fin: row.pedido.visita.fin,
              estado: String(row.pedido.visita.estadoVisita),
            }
          : null,
      },
      cliente: {
        id: row.cliente.id,
        nombre: row.cliente.nombre,
        apellido: row.cliente.apellido,
        nombreCompleto: [row.cliente.nombre, row.cliente.apellido]
          .filter(Boolean)
          .join(' '),
        telefono: row.cliente.telefono,
        correo: row.cliente.correo,
        direccion: row.cliente.direccion,
      },
      vendedor: this.user(row.pedido.vendedor),
      solicitante: this.user(row.solicitante),
      politica: row.politica,
      montos: {
        solicitado: money(row.montoSolicitado),
        anticipoPropuesto: money(row.anticipoPropuesto),
        autorizado: decision?.montoAutorizado ? money(decision.montoAutorizado) : null,
        anticipoRequerido: decision?.anticipoRequerido
          ? money(decision.anticipoRequerido)
          : null,
        financiado: credit?.montoFinanciado ? money(credit.montoFinanciado) : null,
      },
      plazos: {
        solicitadoDias: row.plazoDias,
        autorizadoDias: decision?.plazoAutorizadoDias ?? null,
      },
      expediente: {
        requisitos: row._count?.requisitos ?? sumCounts(reqCounts),
        requisitosCumplidos:
          (reqCounts.CUMPLIDO ?? 0) + (reqCounts.EXONERADO ?? 0),
        requisitosPendientes: reqCounts.PENDIENTE ?? 0,
        requisitosNoCumplidos: reqCounts.NO_CUMPLE ?? 0,
        referencias: row._count?.referencias ?? sumCounts(refCounts),
        referenciasVerificadas: refCounts.VERIFICADA ?? 0,
        referenciasPendientes: refCounts.PENDIENTE ?? 0,
        referenciasRechazadas: refCounts.RECHAZADA ?? 0,
        documentos: row._count?.documentos ?? sumCounts(docCounts),
        documentosValidados: docCounts.VALIDADO ?? 0,
        documentosPendientes: docCounts.PENDIENTE ?? 0,
        documentosRechazados: docCounts.RECHAZADO ?? 0,
      },
      decision: decision
        ? {
            id: decision.id,
            tipo: decision.tipo as CreditDecisionType,
            decididoPor: this.user(decision.decididoPor),
            observaciones: decision.observaciones,
            creadoEn: decision.creadoEn,
          }
        : null,
      credito: credit
        ? {
            id: credit.id,
            numero: credit.numero,
            estado: String(credit.estado),
            aprobadoPor: credit.aprobadoPor ? this.user(credit.aprobadoPor) : null,
            aprobadoEn: credit.aprobadoEn,
          }
        : null,
      integracion: row.operacionPedido
        ? {
            id: row.operacionPedido.id,
            tipo: String(row.operacionPedido.tipo),
            estado: row.operacionPedido.estado as CreditIntegrationState,
            actor: this.user(row.operacionPedido.actor),
            intentos: row.operacionPedido.intentos,
            ultimoError: row.operacionPedido.ultimoError,
            creadoEn: row.operacionPedido.creadoEn,
            actualizadoEn: row.operacionPedido.actualizadoEn,
            aplicadaEn: row.operacionPedido.aplicadaEn,
          }
        : null,
      pagos: {
        cantidad: registered?._count?._all ?? 0,
        montoRegistrado: money(registered?._sum?.monto ?? 0),
        montoVerificado: money(verified?._sum?.monto ?? 0),
        ultimoPagoEn:
          registered?._max?.fechaPago ?? verified?._max?.fechaPago ?? null,
      },
      cuentasPorCobrar: {
        cantidad: accounts?.cantidad ?? 0,
        montoOriginal: money(accounts?.montoOriginal ?? 0),
        saldoPendiente: money(accounts?.saldoPendiente ?? 0),
        vencidas: accounts?.vencidas ?? 0,
      },
      fechas: {
        solicitadaEn: row.solicitadaEn,
        actualizadoEn: row.actualizadoEn,
        enRevisionEn: row.enRevisionEn,
        resueltaEn: row.resueltaEn,
        canceladaEn: row.canceladaEn,
      },
      ultimaActividad: row.eventos?.[0]
        ? {
            tipo: row.eventos[0].tipo as CreditEventType,
            actor: row.eventos[0].usuario ? this.user(row.eventos[0].usuario) : null,
            creadoEn: row.eventos[0].creadoEn,
          }
        : null,
      motivo: row.motivo,
      motivoCancelacion: row.motivoCancelacion,
    };
  }

  private event(row: any): CreditEventView {
    return {
      id: row.id,
      tipo: row.tipo as CreditEventType,
      detalle: row.detalle,
      actor: row.usuario ? this.user(row.usuario) : null,
      referencia:
        row.referenciaTipo && row.referenciaId
          ? { tipo: row.referenciaTipo, id: row.referenciaId }
          : null,
      creadoEn: row.creadoEn,
    };
  }

  private user(row: any): UserView {
    return {
      id: row.id,
      nombre: row.nombre,
      correo: row.correo,
      rol: String(row.rol),
    };
  }

  private policy(row: any): CreditPolicyView {
    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      activo: row.activo,
      montoMaximo: row.montoMaximo?.toFixed(2) ?? null,
      plazoMaximoDias: row.plazoMaximoDias,
      porcentajeAnticipo: row.porcentajeAnticipo?.toFixed(2) ?? null,
      motivoInactivacion: row.motivoInactivacion,
      inactivadaEn: row.inactivadaEn,
      version: row.version,
      requisitos: row.requisitos.map((r: any) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        descripcion: r.descripcion,
        obligatorio: r.obligatorio,
        orden: r.orden,
        activo: r.activo,
      })),
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }
}

function money(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}
function countsFromRows(rows: any[], field: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[field]);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}
function groupedCount(
  rows: any[],
  parentKey: string,
  stateKey: string,
): Map<number, Record<string, number>> {
  const map = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const id = Number(row[parentKey]);
    const entry = map.get(id) ?? {};
    entry[String(row[stateKey])] = row._count._all;
    map.set(id, entry);
  }
  return map;
}
function accountSummaryMap(rows: any[]) {
  const map = new Map<
    number,
    {
      cantidad: number;
      montoOriginal: Prisma.Decimal;
      saldoPendiente: Prisma.Decimal;
      vencidas: number;
    }
  >();
  for (const row of rows) {
    if (!row.creditoId) continue;
    const current = map.get(row.creditoId) ?? {
      cantidad: 0,
      montoOriginal: new Prisma.Decimal(0),
      saldoPendiente: new Prisma.Decimal(0),
      vencidas: 0,
    };
    current.cantidad += row._count._all;
    current.montoOriginal = current.montoOriginal.plus(row._sum.montoOriginal ?? 0);
    current.saldoPendiente = current.saldoPendiente.plus(row._sum.saldoPendiente ?? 0);
    if (row.estado === 'VENCIDA') current.vencidas += row._count._all;
    map.set(row.creditoId, current);
  }
  return map;
}
function stateCounters(rows: any[]): Record<CreditApplicationState, number> {
  const result: Record<CreditApplicationState, number> = {
    PENDIENTE: 0,
    EN_REVISION: 0,
    APROBADA: 0,
    RECHAZADA: 0,
    CANCELADA: 0,
  };
  for (const row of rows) result[row.estado as CreditApplicationState] = row._count._all;
  return result;
}
function integrationCount(rows: any[], state: string) {
  return rows.find((r) => r.estado === state)?._count._all ?? 0;
}
function actionsFor(
  state: CreditApplicationState,
  role: string,
  integrationState?: string | null,
) {
  const writer = ['ADMIN', 'VENDEDOR'].includes(role);
  const reviewer = ['ADMIN', 'CONTABILIDAD'].includes(role);
  return {
    puedeEditar: writer && state === 'PENDIENTE',
    puedeEnviarRevision: writer && state === 'PENDIENTE',
    puedeCancelar: writer && ['PENDIENTE', 'EN_REVISION'].includes(state),
    puedeAgregarExpediente: writer && ['PENDIENTE', 'EN_REVISION'].includes(state),
    puedeRevisarExpediente: reviewer && state === 'EN_REVISION',
    puedeAprobar: reviewer && state === 'EN_REVISION',
    puedeRechazar: reviewer && state === 'EN_REVISION',
    puedeReintentarIntegracion:
      reviewer && integrationState === 'FALLIDA',
  };
}
