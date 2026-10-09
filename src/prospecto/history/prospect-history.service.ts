import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { EstadoProspecto, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import { ProspectHistoryQueryDto } from './prospect-history-query.dto';

const LIST_SELECT = Prisma.validator<Prisma.ProspectoSelect>()({
  id: true, nombreCompleto: true, apellido: true, empresaTienda: true,
  telefono: true, correo: true, direccion: true, usuarioId: true, clienteId: true,
  estado: true, tipoCliente: true, inicio: true, fin: true,
  creadoEn: true, actualizadoEn: true, departamentoId: true, municipioId: true,
  vendedor: { select: { id: true, nombre: true } },
  departamento: { select: { id: true, nombre: true } },
  municipio: { select: { id: true, nombre: true, departamentoId: true } },
});
const DETAIL_SELECT = Prisma.validator<Prisma.ProspectoSelect>()({
  ...LIST_SELECT,
  categoriasInteres: true, volumenCompra: true, presupuestoMensual: true,
  preferenciaContacto: true, comentarios: true,
  ubicacion: { select: { id: true, latitud: true, longitud: true, creadoEn: true } },
});
type ListRow = Prisma.ProspectoGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.ProspectoGetPayload<{ select: typeof DETAIL_SELECT }>;

@Injectable()
export class ProspectHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(userId: number) {
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    const actor = await this.prisma.usuario.findUnique({
      where: { id: userId }, select: { id: true, rol: true, activo: true },
    });
    if (!actor || !actor.activo) throw new UnauthorizedException('Usuario inactivo.');
    if (actor.rol !== 'ADMIN' && actor.rol !== 'VENDEDOR') {
      throw new ForbiddenException('No tienes permisos para prospectos.');
    }
    return actor;
  }

  private format(row: ListRow) {
    return {
      ...row,
      duracionMinutos:
        row.fin && row.inicio
          ? Math.max(0, Math.floor((row.fin.getTime() - row.inicio.getTime()) / 60000))
          : null,
    };
  }

  async list(userId: number, query: ProspectHistoryQueryDto) {
    const actor = await this.actor(userId);
    if (query.desde && query.hasta && new Date(query.desde) > new Date(query.hasta)) {
      throw new BadRequestException('La fecha inicial no puede superar a la final.');
    }
    const terms = query.search?.split(/\s+/).filter(Boolean).slice(0, 8) ?? [];
    const where: Prisma.ProspectoWhereInput = {
      ...((actor.rol === 'VENDEDOR' || !query.vendedorId)
        ? (actor.rol === 'VENDEDOR' ? { usuarioId: actor.id } : {})
        : { usuarioId: query.vendedorId }),
      ...(query.estado ? { estado: query.estado } : {}),
      ...(query.tipoCliente ? { tipoCliente: query.tipoCliente } : {}),
      ...(query.departamentoId ? { departamentoId: query.departamentoId } : {}),
      ...(query.municipioId ? { municipioId: query.municipioId } : {}),
      ...(query.convertido === 'true' ? { clienteId: { not: null } } : {}),
      ...(query.convertido === 'false' ? { clienteId: null } : {}),
      ...(query.desde || query.hasta ? {
        creadoEn: {
          ...(query.desde ? { gte: new Date(query.desde) } : {}),
          ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
        },
      } : {}),
      ...(terms.length ? {
        AND: terms.map((term) => ({
          OR: [
            { nombreCompleto: { contains: term, mode: 'insensitive' as const } },
            { apellido: { contains: term, mode: 'insensitive' as const } },
            { empresaTienda: { contains: term, mode: 'insensitive' as const } },
            { telefono: { contains: term, mode: 'insensitive' as const } },
            { correo: { contains: term, mode: 'insensitive' as const } },
            { direccion: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.prospecto.count({ where }),
      this.prisma.prospecto.findMany({
        where, select: LIST_SELECT,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'desc' }],
      }),
    ]);
    return {
      data: rows.map((row) => this.format(row)),
      meta: buildPageMeta(total, query.page, query.limit),
    };
  }

  async detail(userId: number, id: number) {
    const actor = await this.actor(userId);
    const record = await this.prisma.prospecto.findFirst({
      where: { id, ...(actor.rol === 'VENDEDOR' ? { usuarioId: actor.id } : {}) },
      select: DETAIL_SELECT,
    });
    if (!record) throw new NotFoundException('Prospecto no encontrado.');
    return this.format(record as DetailRow);
  }

  async convertToCustomer(userId: number, id: number) {
    const actor = await this.actor(userId);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.prospecto.findFirst({
        where: {
          id, ...(actor.rol === 'VENDEDOR' ? { usuarioId: actor.id } : {}),
        },
        select: {
          id: true, usuarioId: true, clienteId: true, estado: true,
          nombreCompleto: true, apellido: true, empresaTienda: true,
          correo: true, telefono: true, direccion: true, departamentoId: true,
          municipioId: true, tipoCliente: true, categoriasInteres: true,
          volumenCompra: true, presupuestoMensual: true,
          preferenciaContacto: true, comentarios: true,
          ubicacion: { select: { latitud: true, longitud: true } },
        },
      });
      if (!record) throw new NotFoundException('Prospecto no encontrado.');
      if (record.clienteId || record.estado !== EstadoProspecto.FINALIZADO) {
        throw new ConflictException('Solo se pueden convertir prospectos finalizados y no vinculados.');
      }
      const nombre = record.nombreCompleto?.trim() || record.empresaTienda?.trim();
      const telefono = record.telefono?.trim();
      if (!nombre || !telefono) {
        throw new BadRequestException('Completa el nombre o empresa y teléfono del prospecto antes de convertir.');
      }

      const customer = await tx.cliente.create({
        data: {
          nombre,
          apellido: record.apellido?.trim() || null,
          correo: record.correo?.trim() || null,
          telefono,
          direccion: record.direccion?.trim() || '',
          departamentoId: record.departamentoId,
          municipioId: record.municipioId,
          tipoCliente: record.tipoCliente ?? null,
          categoriasInteres: record.categoriasInteres,
          volumenCompra: record.volumenCompra,
          presupuestoMensual: record.presupuestoMensual,
          preferenciaContacto: record.preferenciaContacto,
          comentarios: record.comentarios,
        },
      });

      // UPDATE condicionado evita crear dos clientes ante conversiones simultáneas.
      // Si falla se revierte también el cliente creado en esta transacción.
      const linked = await tx.prospecto.updateMany({
        where: {
          id, clienteId: null, estado: EstadoProspecto.FINALIZADO,
          ...(actor.rol === 'VENDEDOR' ? { usuarioId: actor.id } : {}),
        },
        data: { clienteId: customer.id },
      });
      if (linked.count !== 1) {
        throw new ConflictException('Este prospecto ya fue convertido.');
      }
      if (record.ubicacion) {
        const location = await tx.ubicacionCliente.create({
          data: {
            clienteId: customer.id,
            latitud: record.ubicacion.latitud,
            longitud: record.ubicacion.longitud,
          },
        });
        await tx.cliente.update({
          where: { id: customer.id },
          data: { ubicacionId: location.id },
        });
      }
      return {
        prospectoId: id,
        clienteId: customer.id,
        cliente: { id: customer.id, nombre: customer.nombre, apellido: customer.apellido },
      };
    });
  }
}
