import { Injectable } from '@nestjs/common';
import { EstadoSesionTracking, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  TrackingHistoryFilters,
  TrackingQueryPort,
  TrackingRealtimeView,
} from '../application/tracking-query.port';
import {
  calculateConfirmedTrackingMinutes,
  calculateJourneyMinutes,
  calculateTotalConfirmedTrackingMinutes,
} from '../application/helpers/tracking-metrics.helper';

@Injectable()
export class TrackingQueryPrismaAdapter implements TrackingQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findRealtimeByUser(
    usuarioId: number,
  ): Promise<TrackingRealtimeView | null> {
    const session = await this.prisma.sesionTrackingUsuario.findFirst({
      where: { usuarioId, estado: EstadoSesionTracking.ACTIVA },
      orderBy: { iniciadaEn: 'desc' },
      include: this.realtimeInclude(),
    });

    return session ? this.mapRealtime(session as any) : null;
  }

  async listRealtime(): Promise<TrackingRealtimeView[]> {
    const sessions = await this.prisma.sesionTrackingUsuario.findMany({
      where: { estado: EstadoSesionTracking.ACTIVA },
      orderBy: { iniciadaEn: 'desc' },
      include: this.realtimeInclude(),
    });

    return sessions.map((session) => this.mapRealtime(session as any));
  }

  async listHistory(filters: TrackingHistoryFilters) {
    const where: Prisma.AsistenciaWhereInput = {
      ...(filters.usuarioId ? { usuarioId: filters.usuarioId } : {}),
      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            fecha: {
              ...(filters.fechaDesde ? { gte: filters.fechaDesde } : {}),
              ...(filters.fechaHasta ? { lte: filters.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filters.estadoSesion
        ? {
            sesionesTracking: {
              some: { estado: filters.estadoSesion as EstadoSesionTracking },
            },
          }
        : {}),
      ...(filters.search?.trim()
        ? {
            usuario: {
              is: {
                OR: [
                  { nombre: { contains: filters.search.trim(), mode: 'insensitive' } },
                  { correo: { contains: filters.search.trim(), mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.asistencia.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { entrada: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              correo: true,
              rol: true,
              activo: true,
            },
          },
          sesionesTracking: {
            orderBy: { iniciadaEn: 'asc' },
            select: {
              id: true,
              estado: true,
              iniciadaEn: true,
              finalizadaEn: true,
              ultimoHeartbeatEn: true,
            },
          },
        },
      }),
      this.prisma.asistencia.count({ where }),
    ]);

    return {
      items: rows.map((row) => {
        const sessions = row.sesionesTracking.map((session) => ({
          estado: session.estado,
          iniciadaEn: session.iniciadaEn,
          finalizadaEn: session.finalizadaEn,
          ultimoHeartbeatEn: session.ultimoHeartbeatEn,
        }));

        return {
          asistenciaId: row.id,
          fecha: row.fecha,
          horaEntrada: row.entrada,
          horaSalida: row.salida,
          tecnico: {
            id: row.usuario.id,
            nombre: row.usuario.nombre,
            correo: row.usuario.correo,
            telefono: null,
            rol: row.usuario.rol,
            avatarUrl: null,
            activo: row.usuario.activo,
          },
          usuario: {
            id: row.usuario.id,
            nombre: row.usuario.nombre,
            correo: row.usuario.correo,
            rol: row.usuario.rol,
            activo: row.usuario.activo,
          },
          tracking: {
            sesionesTotal: sessions.length,
            sesionesFinalizadas: sessions.filter((session) => session.estado === 'FINALIZADA').length,
            sesionesExpiradas: sessions.filter((session) => session.estado === 'EXPIRADA').length,
            haySesionActiva: sessions.some((session) => session.estado === 'ACTIVA'),
            primeraActivacion: sessions[0]?.iniciadaEn ?? null,
            ultimaFinalizacion:
              [...sessions].reverse().find((session) => session.finalizadaEn !== null)?.finalizadaEn ?? null,
            ultimoHeartbeatEn:
              [...sessions].sort(
                (a, b) => b.ultimoHeartbeatEn.getTime() - a.ultimoHeartbeatEn.getTime(),
              )[0]?.ultimoHeartbeatEn ?? null,
            minutosTracking: calculateTotalConfirmedTrackingMinutes(sessions),
          },
        };
      }),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async getAttendanceDetail(asistenciaId: number) {
    const row = await this.prisma.asistencia.findUnique({
      where: { id: asistenciaId },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            correo: true,
            rol: true,
            activo: true,
          },
        },
        sesionesTracking: {
          orderBy: { iniciadaEn: 'asc' },
          include: {
            ubicaciones: {
              orderBy: [{ capturadoEn: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                latitud: true,
                longitud: true,
                bateriaPct: true,
                capturadoEn: true,
              },
            },
          },
        },
      },
    });

    if (!row) return null;

    const sessions = row.sesionesTracking.map((session) => {
      const first = session.ubicaciones[0] ?? null;
      const last = session.ubicaciones[session.ubicaciones.length - 1] ?? null;

      return {
        id: session.id,
        estado: session.estado,
        iniciadoEn: session.iniciadaEn,
        finalizadoEn: session.finalizadaEn,
        ultimoHeartbeatEn: session.ultimoHeartbeatEn,
        duracionMinutos: calculateConfirmedTrackingMinutes({
          estado: session.estado,
          iniciadaEn: session.iniciadaEn,
          finalizadaEn: session.finalizadaEn,
          ultimoHeartbeatEn: session.ultimoHeartbeatEn,
        }),
        puntosRegistrados: session.ubicaciones.length,
        bateriaInicial: first?.bateriaPct ?? null,
        bateriaFinal: last?.bateriaPct ?? null,
        primeraUbicacion: first
          ? {
              latitud: Number(first.latitud),
              longitud: Number(first.longitud),
              capturadoEn: first.capturadoEn,
            }
          : null,
        ultimaUbicacion: last
          ? {
              latitud: Number(last.latitud),
              longitud: Number(last.longitud),
              capturadoEn: last.capturadoEn,
            }
          : null,
      };
    });

    const metricSessions = row.sesionesTracking.map((session) => ({
      estado: session.estado,
      iniciadaEn: session.iniciadaEn,
      finalizadaEn: session.finalizadaEn,
      ultimoHeartbeatEn: session.ultimoHeartbeatEn,
    }));

    const minutosTracking = calculateTotalConfirmedTrackingMinutes(metricSessions);
    const minutosJornada = calculateJourneyMinutes({
      entrada: row.entrada,
      salida: row.salida,
    });

    return {
      asistencia: {
        id: row.id,
        fecha: row.fecha,
        horaEntrada: row.entrada,
        horaSalida: row.salida,
      },
      tecnico: {
        id: row.usuario.id,
        nombre: row.usuario.nombre,
        correo: row.usuario.correo,
        telefono: null,
        rol: row.usuario.rol,
        avatarUrl: null,
        activo: row.usuario.activo,
      },
      usuario: {
        id: row.usuario.id,
        nombre: row.usuario.nombre,
        correo: row.usuario.correo,
        rol: row.usuario.rol,
        activo: row.usuario.activo,
      },
      resumen: {
        sesionesTotal: sessions.length,
        sesionesFinalizadas: sessions.filter((session) => session.estado === 'FINALIZADA').length,
        sesionesExpiradas: sessions.filter((session) => session.estado === 'EXPIRADA').length,
        haySesionActiva: sessions.some((session) => session.estado === 'ACTIVA'),
        primeraActivacion: row.sesionesTracking[0]?.iniciadaEn ?? null,
        ultimaFinalizacion:
          [...row.sesionesTracking].reverse().find((session) => session.finalizadaEn !== null)?.finalizadaEn ?? null,
        ultimoHeartbeatEn:
          [...row.sesionesTracking].sort(
            (a, b) => b.ultimoHeartbeatEn.getTime() - a.ultimoHeartbeatEn.getTime(),
          )[0]?.ultimoHeartbeatEn ?? null,
        minutosTracking,
        minutosJornada,
        minutosSinTracking:
          minutosJornada === null ? null : Math.max(0, minutosJornada - minutosTracking),
      },
      sesiones: sessions,
    };
  }

  async listAttendanceLocations(params: {
    asistenciaId: number;
    sesionId?: number | null;
    page: number;
    limit: number;
  }) {
    const where: Prisma.UbicacionUsuarioHistorialWhereInput = {
      sesion: { is: { asistenciaId: params.asistenciaId } },
      ...(params.sesionId ? { sesionId: params.sesionId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ubicacionUsuarioHistorial.findMany({
        where,
        orderBy: [{ capturadoEn: 'asc' }, { id: 'asc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.ubicacionUsuarioHistorial.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        sesionTrackingId: row.sesionId,
        latitud: Number(row.latitud),
        longitud: Number(row.longitud),
        precision: row.precisionM != null ? Number(row.precisionM) : null,
        velocidad: row.velocidadMps != null ? Number(row.velocidadMps) : null,
        bateria: row.bateriaPct,
        capturadoEn: row.capturadoEn,
        recibidoEn: row.persistidoEn,
      })),
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    };
  }

  private realtimeInclude() {
    return {
      usuario: {
        select: {
          id: true,
          nombre: true,
          rol: true,
          visitas: {
            where: { estadoVisita: 'INICIADA' as const },
            orderBy: { inicio: 'desc' as const },
            take: 3,
            select: {
              id: true,
              clienteId: true,
              inicio: true,
              motivoVisita: true,
              tipoVisita: true,
            },
          },
          enviosResponsable: {
            where: {
              estado: {
                in: [
                  'ASIGNADO',
                  'CARGADO',
                  'EN_RUTA',
                  'ENTREGADO_PARCIAL',
                  'INCIDENCIA',
                ] as any,
              },
            },
            orderBy: { actualizadoEn: 'desc' as const },
            take: 5,
            select: {
              id: true,
              numero: true,
              estado: true,
              salidaEn: true,
              entregaEstimadaEn: true,
            },
          },
        },
      },
      asistencia: {
        select: {
          fecha: true,
          entrada: true,
          salida: true,
          sesionesTracking: {
            orderBy: { iniciadaEn: 'asc' as const },
            select: {
              estado: true,
              iniciadaEn: true,
              finalizadaEn: true,
              ultimoHeartbeatEn: true,
            },
          },
        },
      },
      ubicacionActual: {
        select: {
          latitud: true,
          longitud: true,
          precisionM: true,
          velocidadMps: true,
          bateriaPct: true,
          capturadoEn: true,
          persistidoEn: true,
        },
      },
    } satisfies Prisma.SesionTrackingUsuarioInclude;
  }

  private mapRealtime(session: any): TrackingRealtimeView {
    if (!session.asistenciaId || !session.asistencia) {
      throw new Error('Una sesión ACTIVA debe poseer una jornada asociada.');
    }

    const metricSessions = session.asistencia.sesionesTracking.map(
      (item: any) => ({
        estado: item.estado,
        iniciadaEn: item.iniciadaEn,
        finalizadaEn: item.finalizadaEn,
        ultimoHeartbeatEn: item.ultimoHeartbeatEn,
      }),
    );

    const minutosTracking = calculateTotalConfirmedTrackingMinutes(metricSessions);
    const minutosJornadaConfirmados = Math.max(
      0,
      Math.floor(
        (session.ultimoHeartbeatEn.getTime() -
          session.asistencia.entrada.getTime()) /
          60_000,
      ),
    );

    return {
      tecnico: {
        id: session.usuario.id,
        nombre: session.usuario.nombre,
        telefono: null,
        rol: session.usuario.rol,
        avatarUrl: null,
      },
      tracking: {
        sesionId: session.id,
        asistenciaId: session.asistenciaId,
        estado: session.estado,
        iniciadoEn: session.iniciadaEn,
        ultimoHeartbeatEn: session.ultimoHeartbeatEn,
        minutosSesionActual: calculateConfirmedTrackingMinutes({
          estado: session.estado,
          iniciadaEn: session.iniciadaEn,
          finalizadaEn: session.finalizadaEn,
          ultimoHeartbeatEn: session.ultimoHeartbeatEn,
        }),
      },
      jornada: {
        fecha: session.asistencia.fecha,
        horaEntrada: session.asistencia.entrada,
        horaSalida: session.asistencia.salida,
        sesionesTotal: metricSessions.length,
        sesionesFinalizadas: metricSessions.filter((item: any) => item.estado === 'FINALIZADA').length,
        sesionesExpiradas: metricSessions.filter((item: any) => item.estado === 'EXPIRADA').length,
        minutosTracking,
        minutosJornadaConfirmados,
        minutosSinTrackingConfirmados: Math.max(
          0,
          minutosJornadaConfirmados - minutosTracking,
        ),
      },
      ubicacion: session.ubicacionActual
        ? {
            latitud: Number(session.ubicacionActual.latitud),
            longitud: Number(session.ubicacionActual.longitud),
            precision:
              session.ubicacionActual.precisionM != null
                ? Number(session.ubicacionActual.precisionM)
                : null,
            velocidad:
              session.ubicacionActual.velocidadMps != null
                ? Number(session.ubicacionActual.velocidadMps)
                : null,
            bateria: session.ubicacionActual.bateriaPct,
            capturadoEn: session.ubicacionActual.capturadoEn,
            recibidoEn: session.ubicacionActual.persistidoEn,
          }
        : null,
      actividad: {
        ticketsEnProceso: [],
        visitasActivas: session.usuario.visitas.map((visita: any) => ({
          id: visita.id,
          clienteId: visita.clienteId,
          inicio: visita.inicio,
          motivoVisita: visita.motivoVisita,
          tipoVisita: visita.tipoVisita,
        })),
        enviosActivos: session.usuario.enviosResponsable.map((envio: any) => ({
          id: envio.id,
          numero: envio.numero,
          estado: envio.estado,
          salidaEn: envio.salidaEn,
          entregaEstimadaEn: envio.entregaEstimadaEn,
        })),
      },
    };
  }
}
