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

    return {
      usuarioId: userId,
      sesionId: session?.id ?? null,
      sesionActiva: !!session,
      ultimoHeartbeatEn: session?.ultimoHeartbeatEn ?? null,

      latitud: current?.latitud != null ? Number(current.latitud) : null,

      longitud: current?.longitud != null ? Number(current.longitud) : null,

      precisionM:
        current?.precisionM != null ? Number(current.precisionM) : null,

      velocidadMps:
        current?.velocidadMps != null ? Number(current.velocidadMps) : null,

      bateriaPct: current?.bateriaPct ?? null,

      capturadoEn: current?.capturadoEn ?? null,
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
    const sessions = await this.prisma.sesionTrackingUsuario.findMany({
      where: {
        usuarioId: userId,
      },
      select: {
        id: true,
      },
    });

    const sessionIds = sessions.map((session) => session.id);

    if (!sessionIds.length) {
      return {
        data: [],
        meta: {
          total: 0,
          page: filters.page,
          limit: filters.limit,
          totalPages: 0,
        },
      };
    }

    const where = {
      sesionId: {
        in: sessionIds,
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

        velocidadMps:
          row.velocidadMps != null ? Number(row.velocidadMps) : null,

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
