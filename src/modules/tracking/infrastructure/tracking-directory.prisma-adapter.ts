import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TrackingDirectoryPort } from '../application/tracking-directory.port';

@Injectable()
export class TrackingDirectoryPrismaAdapter implements TrackingDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(userId: number) {
    const [session, current] = await Promise.all([
      this.prisma.sesionTrackingUsuario.findFirst({
        where: {
          usuarioId: userId,
          estado: 'ACTIVA',
        },
        orderBy: {
          iniciadaEn: 'desc',
        },
        select: {
          id: true,
          ultimoHeartbeatEn: true,
        },
      }),
      this.prisma.ubicacionUsuarioActual.findUnique({
        where: {
          usuarioId: userId,
        },
        select: {
          sesionId: true,
          latitud: true,
          longitud: true,
          precisionM: true,
          velocidadMps: true,
          bateriaPct: true,
          capturadoEn: true,
        },
      }),
    ]);

    const activeCurrent =
      session && current?.sesionId === session.id ? current : null;

    return {
      usuarioId: userId,
      sesionId: session?.id ?? null,
      sesionActiva: !!session,
      ultimoHeartbeatEn: session?.ultimoHeartbeatEn ?? null,
      latitud:
        activeCurrent?.latitud != null ? Number(activeCurrent.latitud) : null,
      longitud:
        activeCurrent?.longitud != null ? Number(activeCurrent.longitud) : null,
      precisionM:
        activeCurrent?.precisionM != null ? Number(activeCurrent.precisionM) : null,
      velocidadMps:
        activeCurrent?.velocidadMps != null ? Number(activeCurrent.velocidadMps) : null,
      bateriaPct: activeCurrent?.bateriaPct ?? null,
      capturadoEn: activeCurrent?.capturadoEn ?? null,
    };
  }

  async listHistory(
    userId: number,
    filters: {
      desde?: Date;
      hasta?: Date;
      page: number;
      limit: number;
    },
  ) {
    const where = {
      sesion: {
        usuarioId: userId,
      },
      ...(filters.desde || filters.hasta
        ? {
            capturadoEn: {
              ...(filters.desde ? { gte: filters.desde } : {}),
              ...(filters.hasta ? { lte: filters.hasta } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ubicacionUsuarioHistorial.findMany({
        where,
        orderBy: {
          capturadoEn: 'desc',
        },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        select: {
          latitud: true,
          longitud: true,
          precisionM: true,
          velocidadMps: true,
          bateriaPct: true,
          capturadoEn: true,
        },
      }),
      this.prisma.ubicacionUsuarioHistorial.count({
        where,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        latitud: Number(row.latitud),
        longitud: Number(row.longitud),
        precisionM: row.precisionM != null ? Number(row.precisionM) : null,
        velocidadMps: row.velocidadMps != null ? Number(row.velocidadMps) : null,
        bateriaPct: row.bateriaPct ?? null,
        capturadoEn: row.capturadoEn,
      })),
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }
}
