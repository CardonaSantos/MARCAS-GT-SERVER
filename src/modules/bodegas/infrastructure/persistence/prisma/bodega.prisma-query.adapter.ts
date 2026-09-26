import { Injectable } from '@nestjs/common';
import {
  EstadoEnvio,
  EstadoOrdenDespacho,
  EstadoRequisicion,
  EstadoTransferenciaBodega,
  Prisma,
} from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  BodegaDetailView,
  BodegaEventFilters,
  BodegaEventView,
  BodegaListFilters,
  BodegaListItemView,
  BodegaOperationalSummaryView,
  BodegaOverviewView,
  BodegaResponsibleView,
  BodegaSelectableView,
  BodegaSelectQuery,
  PageResult,
} from '../../../application/models/bodega.models';
import { BodegaQueryPort } from '../../../application/ports/bodega-query.port';
import { BodegaUserRole } from '../../../domain/bodega.types';

const REQUISICIONES_ABIERTAS: EstadoRequisicion[] = [
  'BORRADOR',
  'SOLICITADA',
  'APROBADA',
  'PARCIAL',
];

const TRANSFERENCIAS_ABIERTAS: EstadoTransferenciaBodega[] = [
  'BORRADOR',
  'PREPARADA',
  'EN_TRANSITO',
  'RECIBIDA_PARCIAL',
];

const DESPACHOS_ABIERTOS: EstadoOrdenDespacho[] = [
  'PENDIENTE',
  'PREPARANDO',
  'PREPARADA',
  'PARCIAL',
];

const ENVIOS_ABIERTOS: EstadoEnvio[] = [
  'PROGRAMADO',
  'ASIGNADO',
  'EN_RUTA',
  'ENTREGADO_PARCIAL',
  'INCIDENCIA',
];

const responsibleSelect = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
  activo: true,
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class BodegaPrismaQueryAdapter implements BodegaQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filters: BodegaListFilters,
  ): Promise<PageResult<BodegaListItemView>> {
    const where = this.buildWhere(filters);
    const skip = (filters.page - 1) * filters.limit;

    const orderBy: Prisma.BodegaOrderByWithRelationInput = {
      [filters.sortBy]: filters.sortDir,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bodega.count({ where }),
      this.prisma.bodega.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy,
        include: {
          responsable: { select: responsibleSelect },
        },
      }),
    ]);

    const summaries = await this.loadOperationalSummaries(
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        descripcion: row.descripcion,
        direccion: row.direccion,
        telefono: row.telefono,
        activo: row.activo,
        esPrincipal: row.esPrincipal,
        responsable: row.responsable
          ? this.toResponsibleView(row.responsable)
          : null,
        operacion: summaries.get(row.id) ?? this.emptyOperationalSummary(),
        creadoEn: row.creadoEn,
        actualizadoEn: row.actualizadoEn,
      })),
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
      },
    };
  }

  async getById(id: number): Promise<BodegaDetailView | null> {
    const row = await this.prisma.bodega.findUnique({
      where: { id },
      include: {
        responsable: { select: responsibleSelect },
      },
    });

    if (!row) return null;

    const [summaries, events] = await Promise.all([
      this.loadOperationalSummaries([id]),
      this.findRecentEvents(id, 10),
    ]);

    const operation = summaries.get(id) ?? this.emptyOperationalSummary();
    const blockingReasons = this.getBlockingReasons(
      row.activo,
      row.esPrincipal,
      operation,
    );

    return {
      id: row.id,
      codigo: row.codigo,
      nombre: row.nombre,
      descripcion: row.descripcion,
      direccion: row.direccion,
      telefono: row.telefono,
      activo: row.activo,
      esPrincipal: row.esPrincipal,
      responsable: row.responsable
        ? this.toResponsibleView(row.responsable)
        : null,
      operacion: operation,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
      motivoInactivacion: row.motivoInactivacion,
      inactivadaEn: row.inactivadaEn,
      puedeDesactivarse: row.activo && blockingReasons.length === 0,
      bloqueosDesactivacion: blockingReasons,
      ultimosEventos: events,
    };
  }

  async getPrincipal(): Promise<BodegaDetailView | null> {
    const principal = await this.prisma.bodega.findFirst({
      where: { esPrincipal: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return principal ? this.getById(principal.id) : null;
  }

  async listSelectables(
    query: BodegaSelectQuery,
  ): Promise<BodegaSelectableView[]> {
    const search = query.search?.trim();

    const rows = await this.prisma.bodega.findMany({
      where: {
        activo: true,
        ...(search
          ? {
              OR: [
                { codigo: { contains: search, mode: 'insensitive' } },
                { nombre: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        esPrincipal: true,
      },
      orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
      take: query.limit,
    });

    return rows;
  }

  async listEvents(
    bodegaId: number,
    filters: BodegaEventFilters,
  ): Promise<PageResult<BodegaEventView>> {
    const skip = (filters.page - 1) * filters.limit;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bodegaEvento.count({ where: { bodegaId } }),
      this.prisma.bodegaEvento.findMany({
        where: { bodegaId },
        skip,
        take: filters.limit,
        orderBy: { creadoEn: 'desc' },
        include: {
          usuario: { select: responsibleSelect },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        detalle: row.detalle,
        metadata: row.metadata,
        creadoEn: row.creadoEn,
        actor: row.usuario ? this.toResponsibleView(row.usuario) : null,
      })),
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
      },
    };
  }

  async getOverview(): Promise<BodegaOverviewView> {
    const [total, activas, principal, stock] = await Promise.all([
      this.prisma.bodega.count(),
      this.prisma.bodega.count({ where: { activo: true } }),
      this.prisma.bodega.findFirst({
        where: { esPrincipal: true },
        select: { id: true, codigo: true, nombre: true, esPrincipal: true },
      }),
      this.prisma.stockBodega.aggregate({
        _sum: {
          cantidadReal: true,
          cantidadReservada: true,
          cantidadDisponible: true,
        },
      }),
    ]);

    return {
      total,
      activas,
      inactivas: total - activas,
      principal,
      stockRealTotal: stock._sum.cantidadReal ?? 0,
      stockReservadoTotal: stock._sum.cantidadReservada ?? 0,
      stockDisponibleTotal: stock._sum.cantidadDisponible ?? 0,
    };
  }

  private buildWhere(filters: BodegaListFilters): Prisma.BodegaWhereInput {
    const search = filters.search?.trim();

    return {
      ...(filters.activo !== undefined ? { activo: filters.activo } : {}),
      ...(filters.esPrincipal !== undefined
        ? { esPrincipal: filters.esPrincipal }
        : {}),
      ...(filters.responsableId !== undefined
        ? { responsableId: filters.responsableId }
        : {}),
      ...(search
        ? {
            OR: [
              { codigo: { contains: search, mode: 'insensitive' } },
              { nombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
              { direccion: { contains: search, mode: 'insensitive' } },
              { telefono: { contains: search, mode: 'insensitive' } },
              {
                responsable: {
                  is: {
                    OR: [
                      { nombre: { contains: search, mode: 'insensitive' } },
                      { correo: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async loadOperationalSummaries(
    bodegaIds: number[],
  ): Promise<Map<number, BodegaOperationalSummaryView>> {
    const result = new Map<number, BodegaOperationalSummaryView>();
    if (bodegaIds.length === 0) return result;

    for (const id of bodegaIds) result.set(id, this.emptyOperationalSummary());

    const [stocks, requisiciones, transfersOut, transfersIn, despachos, envios] =
      await Promise.all([
        this.prisma.stockBodega.groupBy({
          by: ['bodegaId'],
          where: {
            bodegaId: { in: bodegaIds },
            OR: [
              { cantidadReal: { gt: 0 } },
              { cantidadReservada: { gt: 0 } },
            ],
          },
          _sum: {
            cantidadReal: true,
            cantidadReservada: true,
            cantidadDisponible: true,
          },
          _count: { _all: true },
        }),
        this.prisma.requisicion.groupBy({
          by: ['bodegaDestinoId'],
          where: {
            bodegaDestinoId: { in: bodegaIds },
            estado: { in: REQUISICIONES_ABIERTAS },
          },
          _count: { _all: true },
        }),
        this.prisma.transferenciaBodega.groupBy({
          by: ['bodegaOrigenId'],
          where: {
            bodegaOrigenId: { in: bodegaIds },
            estado: { in: TRANSFERENCIAS_ABIERTAS },
          },
          _count: { _all: true },
        }),
        this.prisma.transferenciaBodega.groupBy({
          by: ['bodegaDestinoId'],
          where: {
            bodegaDestinoId: { in: bodegaIds },
            estado: { in: TRANSFERENCIAS_ABIERTAS },
          },
          _count: { _all: true },
        }),
        this.prisma.ordenDespacho.groupBy({
          by: ['bodegaId'],
          where: {
            bodegaId: { in: bodegaIds },
            estado: { in: DESPACHOS_ABIERTOS },
          },
          _count: { _all: true },
        }),
        this.prisma.envioDespacho.findMany({
          where: {
            ordenDespacho: { bodegaId: { in: bodegaIds } },
            envio: { estado: { in: ENVIOS_ABIERTOS } },
          },
          select: {
            envioId: true,
            ordenDespacho: { select: { bodegaId: true } },
          },
        }),
      ]);

    const patch = (
      id: number,
      values: Partial<BodegaOperationalSummaryView>,
    ) => {
      result.set(id, { ...(result.get(id) ?? this.emptyOperationalSummary()), ...values });
    };

    for (const row of stocks) {
      patch(row.bodegaId, {
        stockReal: row._sum.cantidadReal ?? 0,
        stockReservado: row._sum.cantidadReservada ?? 0,
        stockDisponible: row._sum.cantidadDisponible ?? 0,
        productosConStock: row._count._all,
      });
    }

    for (const row of requisiciones) {
      patch(row.bodegaDestinoId, {
        requisicionesPendientes: row._count._all,
      });
    }

    for (const row of transfersOut) {
      const current = result.get(row.bodegaOrigenId) ?? this.emptyOperationalSummary();
      patch(row.bodegaOrigenId, {
        transferenciasPendientes:
          current.transferenciasPendientes + row._count._all,
      });
    }

    for (const row of transfersIn) {
      const current = result.get(row.bodegaDestinoId) ?? this.emptyOperationalSummary();
      patch(row.bodegaDestinoId, {
        transferenciasPendientes:
          current.transferenciasPendientes + row._count._all,
      });
    }

    for (const row of despachos) {
      patch(row.bodegaId, { despachosPendientes: row._count._all });
    }

    const enviosByBodega = new Map<number, Set<number>>();
    for (const row of envios) {
      const id = row.ordenDespacho.bodegaId;
      const ids = enviosByBodega.get(id) ?? new Set<number>();
      ids.add(row.envioId);
      enviosByBodega.set(id, ids);
    }
    for (const [id, ids] of enviosByBodega) {
      patch(id, { enviosPendientes: ids.size });
    }

    return result;
  }

  private async findRecentEvents(
    bodegaId: number,
    limit: number,
  ): Promise<BodegaEventView[]> {
    const rows = await this.prisma.bodegaEvento.findMany({
      where: { bodegaId },
      orderBy: { creadoEn: 'desc' },
      take: limit,
      include: {
        usuario: { select: responsibleSelect },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      detalle: row.detalle,
      metadata: row.metadata,
      creadoEn: row.creadoEn,
      actor: row.usuario ? this.toResponsibleView(row.usuario) : null,
    }));
  }

  private toResponsibleView(user: {
    id: number;
    nombre: string;
    correo: string;
    rol: BodegaUserRole;
    activo: boolean;
  }): BodegaResponsibleView {
    return {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
      activo: user.activo,
    };
  }

  private emptyOperationalSummary(): BodegaOperationalSummaryView {
    return {
      stockReal: 0,
      stockReservado: 0,
      stockDisponible: 0,
      productosConStock: 0,
      requisicionesPendientes: 0,
      transferenciasPendientes: 0,
      despachosPendientes: 0,
      enviosPendientes: 0,
    };
  }

  private getBlockingReasons(
    activo: boolean,
    esPrincipal: boolean,
    operation: BodegaOperationalSummaryView,
  ): string[] {
    const reasons: string[] = [];

    if (!activo) reasons.push('La bodega ya está inactiva.');
    if (esPrincipal) reasons.push('Es la bodega principal.');
    if (operation.stockReal > 0)
      reasons.push(`Tiene ${operation.stockReal} unidades de stock real.`);
    if (operation.stockReservado > 0)
      reasons.push(`Tiene ${operation.stockReservado} unidades reservadas.`);
    if (operation.requisicionesPendientes > 0)
      reasons.push('Tiene requisiciones pendientes.');
    if (operation.transferenciasPendientes > 0)
      reasons.push('Tiene transferencias pendientes.');
    if (operation.despachosPendientes > 0)
      reasons.push('Tiene órdenes de despacho pendientes.');
    if (operation.enviosPendientes > 0)
      reasons.push('Tiene envíos pendientes.');

    return reasons;
  }
}
