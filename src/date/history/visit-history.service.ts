import {
  BadRequestException, ForbiddenException, Injectable,
  NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import { VisitHistoryQueryDto } from './visit-history-query.dto';

const LIST_SELECT = Prisma.validator<Prisma.VisitaSelect>()({
  id: true, inicio: true, fin: true, creadoEn: true, actualizadoEn: true,
  usuarioId: true, clienteId: true, estadoVisita: true, motivoVisita: true,
  tipoVisita: true, observaciones: true,
  cliente: {
    select: {
      id: true, nombre: true, apellido: true, telefono: true,
      direccion: true, departamentoId: true, municipioId: true,
    },
  },
  vendedor: { select: { id: true, nombre: true } },
  _count: { select: { ventas: true, pedidos: true } },
});
const DETAIL_SELECT = Prisma.validator<Prisma.VisitaSelect>()({
  ...LIST_SELECT,
  cliente: {
    select: {
      id: true, nombre: true, apellido: true, telefono: true, correo: true,
      direccion: true, tipoCliente: true, presupuestoMensual: true,
      preferenciaContacto: true, categoriasInteres: true, comentarios: true,
      departamentoId: true, municipioId: true,
      departamento: { select: { id: true, nombre: true } },
      municipio: { select: { id: true, nombre: true, departamentoId: true } },
      ubicacion: { select: { latitud: true, longitud: true } },
    },
  },
  vendedor: { select: { id: true, nombre: true, correo: true, rol: true } },
  ventas: {
    orderBy: { timestamp: 'desc' },
    take: 30,
    select: {
      id: true, monto: true, montoConDescuento: true,
      descuento: true, metodoPago: true, timestamp: true,
      referenciaPago: true,
    },
  },
  pedidos: {
    orderBy: { creadoEn: 'desc' },
    take: 30,
    select: {
      id: true, numero: true, total: true, estado: true,
      estadoPago: true, creadoEn: true,
    },
  },
});
type VisitListRow = Prisma.VisitaGetPayload<{ select: typeof LIST_SELECT }>;

@Injectable()
export class VisitHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireActor(userId: number) {
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, rol: true, activo: true },
    });
    if (!user?.activo) throw new UnauthorizedException('Usuario inexistente o inactivo.');
    if (user.rol !== 'ADMIN' && user.rol !== 'VENDEDOR') {
      throw new ForbiddenException('No tienes permisos para consultar visitas.');
    }
    return user;
  }

  private enrich<T extends VisitListRow>(visit: T) {
    return {
      ...visit,
      duracionMinutos: visit.fin
        ? Math.max(0, Math.floor((visit.fin.getTime() - visit.inicio.getTime()) / 60000))
        : null,
    };
  }

  async list(userId: number, query: VisitHistoryQueryDto) {
    const actor = await this.requireActor(userId);
    if (query.desde && query.hasta && query.desde > query.hasta) {
      throw new BadRequestException('La fecha inicial no puede superar a la final.');
    }
    const startDay = (day: string) => new Date(`${day}T00:00:00-06:00`);
    const nextDay = (day: string) => new Date(startDay(day).getTime() + 86400000);
    const tokens = query.search?.split(/\s+/).filter(Boolean).slice(0, 8) ?? [];
    const where: Prisma.VisitaWhereInput = {
      ...(actor.rol === 'VENDEDOR' ? { usuarioId: actor.id } :
        query.vendedorId ? { usuarioId: query.vendedorId } : {}),
      ...(query.clienteId ? { clienteId: query.clienteId } : {}),
      ...(query.estadoVisita ? { estadoVisita: query.estadoVisita } : {}),
      ...(query.tipoVisita ? { tipoVisita: query.tipoVisita } : {}),
      ...(query.motivoVisita ? { motivoVisita: query.motivoVisita } : {}),
      ...(query.departamentoId || query.municipioId ? {
        cliente: {
          is: {
            ...(query.departamentoId ? { departamentoId: query.departamentoId } : {}),
            ...(query.municipioId ? { municipioId: query.municipioId } : {}),
          },
        },
      } : {}),
      ...(query.desde || query.hasta ? {
        inicio: {
          ...(query.desde ? { gte: startDay(query.desde) } : {}),
          ...(query.hasta ? { lt: nextDay(query.hasta) } : {}),
        },
      } : {}),
      ...(tokens.length ? {
        AND: tokens.map((token) => {
          const numericId = /^\d+$/.test(token) && Number.isSafeInteger(Number(token))
            ? Number(token) : null;
          return {
            OR: [
              ...(numericId ? [{ id: numericId }] : []),
              { cliente: { is: { nombre: { contains: token, mode: 'insensitive' as const } } } },
              { cliente: { is: { apellido: { contains: token, mode: 'insensitive' as const } } } },
              { cliente: { is: { telefono: { contains: token, mode: 'insensitive' as const } } } },
              { cliente: { is: { correo: { contains: token, mode: 'insensitive' as const } } } },
              { cliente: { is: { direccion: { contains: token, mode: 'insensitive' as const } } } },
              { vendedor: { is: { nombre: { contains: token, mode: 'insensitive' as const } } } },
            ],
          };
        }),
      } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.visita.count({ where }),
      this.prisma.visita.findMany({
        where, select: LIST_SELECT,
        skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'desc' }],
      }),
    ]);
    return {
      data: rows.map((row) => this.enrich(row)),
      meta: buildPageMeta(total, query.page, query.limit),
    };
  }

  async detail(userId: number, id: number) {
    const actor = await this.requireActor(userId);
    const visit = await this.prisma.visita.findFirst({
      where: { id, ...(actor.rol === 'VENDEDOR' ? { usuarioId: actor.id } : {}) },
      select: DETAIL_SELECT,
    });
    if (!visit) throw new NotFoundException('Visita no encontrada.');
    return this.enrich(visit);
  }
}
