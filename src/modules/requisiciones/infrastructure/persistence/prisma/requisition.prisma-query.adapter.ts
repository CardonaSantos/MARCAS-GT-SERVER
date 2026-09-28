import { Injectable } from '@nestjs/common';
import { EstadoRequisicion, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import {
  ReceiptListFilters,
  ReceiptPage,
  RequisitionDetailView,
  RequisitionEventFilters,
  RequisitionEventPage,
  RequisitionListFilters,
  RequisitionListItemView,
  RequisitionPage,
  RequisitionSummaryView,
  ReceiptView,
} from '../../../application/models/requisition.models';
import { RequisitionQueryPort } from '../../../application/ports/requisition-query.port';

const userSelect = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
} satisfies Prisma.UsuarioSelect;

const listInclude = {
  bodegaDestino: { select: { id: true, codigo: true, nombre: true, esPrincipal: true } },
  proveedor: { select: { id: true, nombre: true, telefono: true, correo: true } },
  solicitante: { select: userSelect },
  detalles: { select: { cantidadSolicitada: true, cantidadRecibida: true, costoUnitarioEstimado: true } },
} satisfies Prisma.RequisicionInclude;

const receiptViewInclude = {
  recibidoPor: { select: userSelect },
  detalles: {
    include: {
      requisicionDetalle: {
        include: { producto: { select: { id: true, codigoProducto: true, nombre: true } } },
      },
    },
  },
} satisfies Prisma.RecepcionRequisicionInclude;

const detailInclude = {
  bodegaDestino: { select: { id: true, codigo: true, nombre: true, esPrincipal: true } },
  proveedor: { select: { id: true, nombre: true, telefono: true, correo: true } },
  solicitante: { select: userSelect },
  detalles: {
    orderBy: { id: 'asc' as const },
    include: { producto: { select: { id: true, codigoProducto: true, nombre: true } } },
  },
  eventos: {
    orderBy: { creadoEn: 'desc' as const },
    take: 30,
    include: { usuario: { select: userSelect } },
  },
  recepciones: {
    orderBy: { recibidoEn: 'desc' as const },
    take: 30,
    include: receiptViewInclude,
  },
} satisfies Prisma.RequisicionInclude;

type ListRow = Prisma.RequisicionGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.RequisicionGetPayload<{ include: typeof detailInclude }>;
type ReceiptRow = Prisma.RecepcionRequisicionGetPayload<{ include: typeof receiptViewInclude }>;
type UserRow = Pick<Prisma.UsuarioGetPayload<object>, 'id' | 'nombre' | 'correo' | 'rol'>;

@Injectable()
export class RequisitionPrismaQueryAdapter implements RequisitionQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: RequisitionListFilters): Promise<RequisitionPage> {
    const where = this.buildWhere(filters);
    const skip = (filters.page - 1) * filters.limit;
    const orderBy = this.buildOrderBy(filters);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.requisicion.count({ where }),
      this.prisma.requisicion.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy,
        include: listInclude,
      }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getById(id: number): Promise<RequisitionDetailView | null> {
    const row = await this.prisma.requisicion.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!row) return null;

    const base = this.toListItem(row);
    return {
      ...base,
      version: row.version,
      motivoRechazo: row.motivoRechazo,
      motivoCancelacion: row.motivoCancelacion,
      rechazadaEn: row.rechazadaEn,
      canceladaEn: row.canceladaEn,
      detalles: row.detalles.map((detail) => {
        const pending = detail.cantidadSolicitada - detail.cantidadRecibida;
        const pct = detail.cantidadSolicitada === 0 ? 0 : (detail.cantidadRecibida / detail.cantidadSolicitada) * 100;
        const subtotal = detail.costoUnitarioEstimado
          ? detail.costoUnitarioEstimado.mul(detail.cantidadSolicitada).toFixed(2)
          : null;
        return {
          id: detail.id,
          producto: {
            id: detail.producto.id,
            codigo: detail.producto.codigoProducto,
            nombre: detail.producto.nombre,
          },
          cantidadSolicitada: detail.cantidadSolicitada,
          cantidadRecibida: detail.cantidadRecibida,
          cantidadPendiente: pending,
          porcentajeRecepcion: round2(pct),
          costoUnitarioEstimado: detail.costoUnitarioEstimado?.toFixed(4) ?? null,
          subtotalEstimado: subtotal,
          version: detail.version,
        };
      }),
      recepciones: row.recepciones.map((receipt) => this.toReceiptView(receipt)),
      eventos: row.eventos.map((event) => ({
        id: event.id,
        tipo: event.tipo,
        detalle: event.detalle,
        actor: event.usuario ? this.toUser(event.usuario) : null,
        creadoEn: event.creadoEn,
      })),
      acciones: actionsFor(row.estado),
    };
  }

  async listEvents(
    id: number,
    filters: RequisitionEventFilters,
  ): Promise<RequisitionEventPage> {
    const skip = (filters.page - 1) * filters.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.requisicionEvento.count({ where: { requisicionId: id } }),
      this.prisma.requisicionEvento.findMany({
        where: { requisicionId: id },
        skip,
        take: filters.limit,
        orderBy: { creadoEn: 'desc' },
        include: { usuario: { select: userSelect } },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        detalle: row.detalle,
        actor: row.usuario ? this.toUser(row.usuario) : null,
        creadoEn: row.creadoEn,
      })),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async listReceipts(filters: ReceiptListFilters): Promise<ReceiptPage> {
    const skip = (filters.page - 1) * filters.limit;
    const where: Prisma.RecepcionRequisicionWhereInput = {
      ...(filters.requisicionId ? { requisicionId: filters.requisicionId } : {}),
      ...(filters.recibidoPorId ? { recibidoPorId: filters.recibidoPorId } : {}),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            recibidoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filters.bodegaDestinoId || filters.proveedorId
        ? {
            requisicion: {
              ...(filters.bodegaDestinoId ? { bodegaDestinoId: filters.bodegaDestinoId } : {}),
              ...(filters.proveedorId ? { proveedorId: filters.proveedorId } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.recepcionRequisicion.count({ where }),
      this.prisma.recepcionRequisicion.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { recibidoEn: 'desc' },
        include: receiptViewInclude,
      }),
    ]);

    return {
      data: rows.map((row) => this.toReceiptView(row)),
      meta: buildPageMeta(total, filters.page, filters.limit),
    };
  }

  async getSummary(filters?: {
    bodegaDestinoId?: number;
    proveedorId?: number;
    fechaDesde?: Date;
    fechaHasta?: Date;
  }): Promise<RequisitionSummaryView> {
    const where: Prisma.RequisicionWhereInput = {
      ...(filters?.bodegaDestinoId ? { bodegaDestinoId: filters.bodegaDestinoId } : {}),
      ...(filters?.proveedorId ? { proveedorId: filters.proveedorId } : {}),
      ...(filters?.fechaDesde || filters?.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.requisicion.findMany({
      where,
      select: {
        id: true,
        estado: true,
        detalles: {
          select: {
            cantidadSolicitada: true,
            cantidadRecibida: true,
            costoUnitarioEstimado: true,
          },
        },
      },
    });
    const ids = rows.map((row) => row.id);
    const receiptGroups = ids.length
      ? await this.prisma.recepcionRequisicion.groupBy({
          by: ['estado'],
          where: { requisicionId: { in: ids }, estado: { in: ['PENDIENTE', 'FALLIDA'] } },
          _count: { _all: true },
        })
      : [];

    const count = (state: string) => rows.filter((row) => row.estado === state).length;
    let requested = 0;
    let received = 0;
    let estimated = new Prisma.Decimal(0);
    for (const row of rows) {
      for (const detail of row.detalles) {
        requested += detail.cantidadSolicitada;
        received += detail.cantidadRecibida;
        if (detail.costoUnitarioEstimado) {
          estimated = estimated.plus(detail.costoUnitarioEstimado.mul(detail.cantidadSolicitada));
        }
      }
    }
    const receiptCount = (state: string) =>
      receiptGroups.find((group) => group.estado === state)?._count._all ?? 0;

    return {
      total: rows.length,
      borradores: count('BORRADOR'),
      solicitadas: count('SOLICITADA'),
      aprobadas: count('APROBADA'),
      parciales: count('PARCIAL'),
      completadas: count('COMPLETADA'),
      rechazadas: count('RECHAZADA'),
      canceladas: count('CANCELADA'),
      abiertas: rows.filter((row) => ['BORRADOR', 'SOLICITADA', 'APROBADA', 'PARCIAL'].includes(row.estado)).length,
      unidadesSolicitadas: requested,
      unidadesRecibidas: received,
      unidadesPendientes: requested - received,
      costoEstimadoTotal: estimated.toFixed(2),
      recepcionesPendientes: receiptCount('PENDIENTE'),
      recepcionesFallidas: receiptCount('FALLIDA'),
    };
  }

  private buildWhere(filters: RequisitionListFilters): Prisma.RequisicionWhereInput {
    const search = filters.search?.trim();
    const stateFilter = filters.soloPendientesRecepcion
      ? { in: ['APROBADA', 'PARCIAL'] as EstadoRequisicion[] }
      : filters.estado
        ? filters.estado
        : undefined;
    return {
      ...(stateFilter ? { estado: stateFilter } : {}),
      ...(filters.bodegaDestinoId ? { bodegaDestinoId: filters.bodegaDestinoId } : {}),
      ...(filters.proveedorId ? { proveedorId: filters.proveedorId } : {}),
      ...(filters.solicitanteId ? { solicitanteId: filters.solicitanteId } : {}),
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
              { observaciones: { contains: search, mode: 'insensitive' } },
              { bodegaDestino: { is: { OR: [
                { codigo: { contains: search, mode: 'insensitive' } },
                { nombre: { contains: search, mode: 'insensitive' } },
              ] } } },
              { proveedor: { is: { nombre: { contains: search, mode: 'insensitive' } } } },
              { solicitante: { is: { OR: [
                { nombre: { contains: search, mode: 'insensitive' } },
                { correo: { contains: search, mode: 'insensitive' } },
              ] } } },
              { detalles: { some: { producto: { OR: [
                { codigoProducto: { contains: search, mode: 'insensitive' } },
                { nombre: { contains: search, mode: 'insensitive' } },
              ] } } } },
            ],
          }
        : {}),
    };
  }

  private buildOrderBy(filters: RequisitionListFilters): Prisma.RequisicionOrderByWithRelationInput {
    switch (filters.sortBy) {
      case 'bodega': return { bodegaDestino: { nombre: filters.sortDir } };
      case 'proveedor': return { proveedor: { nombre: filters.sortDir } };
      case 'solicitante': return { solicitante: { nombre: filters.sortDir } };
      default: return { [filters.sortBy]: filters.sortDir };
    }
  }

  private toListItem(row: ListRow | DetailRow): RequisitionListItemView {
    let requested = 0;
    let received = 0;
    let estimated = new Prisma.Decimal(0);
    for (const detail of row.detalles) {
      requested += detail.cantidadSolicitada;
      received += detail.cantidadRecibida;
      if (detail.costoUnitarioEstimado) {
        estimated = estimated.plus(detail.costoUnitarioEstimado.mul(detail.cantidadSolicitada));
      }
    }
    return {
      id: row.id,
      estado: row.estado,
      bodega: row.bodegaDestino,
      proveedor: row.proveedor,
      solicitante: this.toUser(row.solicitante),
      progreso: {
        productos: row.detalles.length,
        unidadesSolicitadas: requested,
        unidadesRecibidas: received,
        unidadesPendientes: requested - received,
        porcentajeRecepcion: requested === 0 ? 0 : round2((received / requested) * 100),
        costoEstimado: estimated.toFixed(2),
      },
      observaciones: row.observaciones,
      solicitadaEn: row.solicitadaEn,
      aprobadaEn: row.aprobadaEn,
      completadaEn: row.completadaEn,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }

  private toReceiptView(row: ReceiptRow): ReceiptView {
    let units = 0;
    let total = new Prisma.Decimal(0);
    const details = row.detalles.map((detail) => {
      units += detail.cantidad;
      const subtotal = detail.costoUnitario.mul(detail.cantidad);
      total = total.plus(subtotal);
      const product = detail.requisicionDetalle.producto;
      return {
        id: detail.id,
        requisicionDetalleId: detail.requisicionDetalleId,
        producto: { id: product.id, codigo: product.codigoProducto, nombre: product.nombre },
        cantidad: detail.cantidad,
        costoUnitario: detail.costoUnitario.toFixed(4),
        subtotal: subtotal.toFixed(2),
      };
    });
    return {
      id: row.id,
      requisicionId: row.requisicionId,
      estado: row.estado,
      recibidoPor: this.toUser(row.recibidoPor),
      claveIdempotencia: row.claveIdempotencia,
      documentoReferencia: row.documentoReferencia,
      observaciones: row.observaciones,
      recibidoEn: row.recibidoEn,
      aplicadaEn: row.aplicadaEn,
      errorAplicacion: row.errorAplicacion,
      detalles: details,
      unidades: units,
      costoTotal: total.toFixed(2),
      creadoEn: row.creadoEn,
    };
  }

  private toUser(user: UserRow) {
    return { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function actionsFor(state: string) {
  return {
    puedeEditar: state === 'BORRADOR',
    puedeSolicitar: state === 'BORRADOR',
    puedeAprobar: state === 'SOLICITADA',
    puedeRechazar: state === 'SOLICITADA',
    puedeRecibir: state === 'APROBADA' || state === 'PARCIAL',
    puedeCancelar: ['BORRADOR', 'SOLICITADA', 'APROBADA', 'PARCIAL'].includes(state),
  };
}
