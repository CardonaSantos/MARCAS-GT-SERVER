import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { buildPageMeta } from 'src/shared/application/pagination/page.models';
import { CustomerDirectoryQueryDto } from './customer-directory-query.dto';
import type { CustomerDirectoryDetail, CustomerDirectoryItem, CustomerDirectoryPage } from './customer-directory.models';

const DIRECTORY_SELECT = Prisma.validator<Prisma.ClienteSelect>()({
  id: true, nombre: true, apellido: true, correo: true, telefono: true,
  direccion: true, tipoCliente: true, categoriasInteres: true, volumenCompra: true,
  presupuestoMensual: true, preferenciaContacto: true,
  departamentoId: true, municipioId: true, creadoEn: true, actualizadoEn: true,
  departamento: { select: { id: true, nombre: true } },
  municipio: { select: { id: true, nombre: true, departamentoId: true } },
  ubicacion: { select: { latitud: true, longitud: true } },
  _count: { select: {
    ventas: true, pedidos: true, visitas: true, solicitudesCredito: true, entregas: true,
  } },
});
type DirectoryRow = Prisma.ClienteGetPayload<{ select: typeof DIRECTORY_SELECT }>;

@Injectable()
export class CustomerDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerDirectoryQueryDto): Promise<CustomerDirectoryPage> {
    const terms = query.search?.split(/\s+/).filter(Boolean).slice(0, 8) ?? [];
    const interests = [...new Set(query.intereses?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])];
    const where: Prisma.ClienteWhereInput = {
      ...(terms.length ? {
        AND: terms.map((term) => ({
          OR: [
            { nombre: { contains: term, mode: 'insensitive' as const } },
            { apellido: { contains: term, mode: 'insensitive' as const } },
            { correo: { contains: term, mode: 'insensitive' as const } },
            { telefono: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      } : {}),
      ...(query.departamentoId ? { departamentoId: query.departamentoId } : {}),
      ...(query.municipioId ? { municipioId: query.municipioId } : {}),
      ...(query.tipoCliente ? { tipoCliente: query.tipoCliente } : {}),
      ...(query.volumenCompra ? { volumenCompra: query.volumenCompra } : {}),
      ...(query.presupuestoMensual ? { presupuestoMensual: query.presupuestoMensual } : {}),
      ...(interests.length ? { categoriasInteres: { hasSome: interests } } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        select: DIRECTORY_SELECT,
      }),
    ]);

    return {
      data: rows.map((row) => this.toItem(row)),
      meta: buildPageMeta(total, query.page, query.limit),
    };
  }

  async detail(id: number): Promise<CustomerDirectoryDetail> {
    const customer = await this.prisma.cliente.findUnique({
      where: { id },
      select: {
        ...DIRECTORY_SELECT,
        comentarios: true,
        perfilFiscal: {
          select: {
            tipoIdentificacion: true,
            identificacion: true,
            nombreFiscal: true,
            correoFiscal: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado.');

    return {
      ...this.toItem(customer),
      comentarios: customer.comentarios,
      perfilFiscal: customer.perfilFiscal,
    };
  }

  private toItem(row: DirectoryRow): CustomerDirectoryItem {
    return {
      id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      correo: row.correo,
      telefono: row.telefono,
      direccion: row.direccion,
      tipoCliente: row.tipoCliente,
      categoriasInteres: row.categoriasInteres,
      volumenCompra: row.volumenCompra,
      presupuestoMensual: row.presupuestoMensual,
      preferenciaContacto: row.preferenciaContacto,
      departamento: row.departamento,
      municipio: row.municipio,
      departamentoId: row.departamentoId,
      municipioId: row.municipioId,
      ubicacion: row.ubicacion,
      actividad: {
        ventas: row._count.ventas,
        pedidos: row._count.pedidos,
        visitas: row._count.visitas,
        solicitudesCredito: row._count.solicitudesCredito,
        entregas: row._count.entregas,
      },
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
    };
  }
}
