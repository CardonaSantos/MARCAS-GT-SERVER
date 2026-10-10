import { Injectable } from '@nestjs/common';
import { EstadoSesionTracking, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  FinishTrackingResult,
  RegisterLocationResult,
  StartTrackingResult,
  TrackingAttendanceRecord,
  TrackingRepositoryPort,
  TrackingSessionRecord,
} from '../application/tracking.repository.port';

@Injectable()
export class TrackingPrismaRepository implements TrackingRepositoryPort {
  private static readonly SERIALIZABLE_RETRIES = 4;
  private static readonly CAS_RETRIES = 5;

  constructor(private readonly prisma: PrismaService) {}

  async findActiveSessionByUser(
    usuarioId: number,
  ): Promise<TrackingSessionRecord | null> {
    const row = await this.prisma.sesionTrackingUsuario.findFirst({
      where: { usuarioId, estado: EstadoSesionTracking.ACTIVA },
      orderBy: { iniciadaEn: 'desc' },
    });

    return row ? this.mapSession(row) : null;
  }

  async startTracking(params: {
    usuarioId: number;
    fecha: Date;
    iniciadaEn: Date;
  }): Promise<StartTrackingResult> {
    return this.runSerializable(async (tx) => {
      const active = await tx.sesionTrackingUsuario.findFirst({
        where: {
          usuarioId: params.usuarioId,
          estado: EstadoSesionTracking.ACTIVA,
        },
        orderBy: { iniciadaEn: 'desc' },
      });

      if (active) {
        if (!active.asistenciaId) {
          throw new Error('La sesión activa no posee una jornada asociada.');
        }

        const attendance = await tx.asistencia.findUnique({
          where: { id: active.asistenciaId },
        });

        if (!attendance) {
          throw new Error('No existe la jornada asociada a la sesión activa.');
        }

        return {
          asistencia: this.mapAttendance(attendance),
          sesion: this.mapSession(active),
        };
      }

      let attendance = await tx.asistencia.findUnique({
        where: {
          usuarioId_fecha: {
            usuarioId: params.usuarioId,
            fecha: params.fecha,
          },
        },
      });

      if (!attendance) {
        attendance = await tx.asistencia.create({
          data: {
            usuarioId: params.usuarioId,
            fecha: params.fecha,
            entrada: params.iniciadaEn,
            salida: null,
          },
        });
      } else if (attendance.salida !== null) {
        attendance = await tx.asistencia.update({
          where: { id: attendance.id },
          data: { salida: null },
        });
      }

      const session = await tx.sesionTrackingUsuario.create({
        data: {
          usuarioId: params.usuarioId,
          asistenciaId: attendance.id,
          estado: EstadoSesionTracking.ACTIVA,
          iniciadaEn: params.iniciadaEn,
          finalizadaEn: null,
          ultimoHeartbeatEn: params.iniciadaEn,
          motivoCierre: null,
        },
      });

      return {
        asistencia: this.mapAttendance(attendance),
        sesion: this.mapSession(session),
      };
    });
  }

  async registerLocation(params: {
    usuarioId: number;
    sesionId: number;
    claveIdempotencia: string;
    latitud: number;
    longitud: number;
    precisionM: number | null;
    velocidadMps: number | null;
    bateriaPct: number | null;
    capturadoEn: Date;
    recibidoEn: Date;
  }): Promise<RegisterLocationResult> {
    const existing = await this.findIdempotentLocation(params);
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const duplicate = await this.findIdempotentLocation(params, tx);
        if (duplicate) return duplicate;

        for (
          let attempt = 0;
          attempt < TrackingPrismaRepository.CAS_RETRIES;
          attempt += 1
        ) {
          const session = await tx.sesionTrackingUsuario.findFirst({
            where: { id: params.sesionId, usuarioId: params.usuarioId },
          });

          if (!session) {
            return { applied: false as const, reason: 'SESSION_NOT_FOUND' as const };
          }

          if (session.estado !== EstadoSesionTracking.ACTIVA) {
            return { applied: false as const, reason: 'SESSION_NOT_ACTIVE' as const };
          }

          const heartbeat =
            params.recibidoEn.getTime() > session.ultimoHeartbeatEn.getTime()
              ? params.recibidoEn
              : session.ultimoHeartbeatEn;

          const locked = await tx.sesionTrackingUsuario.updateMany({
            where: {
              id: session.id,
              usuarioId: params.usuarioId,
              estado: EstadoSesionTracking.ACTIVA,
              ultimoHeartbeatEn: session.ultimoHeartbeatEn,
            },
            data: { ultimoHeartbeatEn: heartbeat },
          });

          if (locked.count !== 1) continue;

          const location = await tx.ubicacionUsuarioHistorial.create({
            data: {
              sesionId: params.sesionId,
              claveIdempotencia: params.claveIdempotencia,
              latitud: params.latitud,
              longitud: params.longitud,
              precisionM: params.precisionM,
              velocidadMps: params.velocidadMps,
              bateriaPct: params.bateriaPct,
              capturadoEn: params.capturadoEn,
              persistidoEn: params.recibidoEn,
            },
          });

          const current = await tx.ubicacionUsuarioActual.findUnique({
            where: { usuarioId: params.usuarioId },
            select: { id: true, sesionId: true, capturadoEn: true },
          });

          const shouldAdvanceSnapshot =
            !current ||
            current.sesionId !== params.sesionId ||
            params.capturadoEn.getTime() >= current.capturadoEn.getTime();

          if (shouldAdvanceSnapshot) {
            await tx.ubicacionUsuarioActual.upsert({
              where: { usuarioId: params.usuarioId },
              create: {
                usuarioId: params.usuarioId,
                sesionId: params.sesionId,
                latitud: params.latitud,
                longitud: params.longitud,
                precisionM: params.precisionM,
                velocidadMps: params.velocidadMps,
                bateriaPct: params.bateriaPct,
                capturadoEn: params.capturadoEn,
                persistidoEn: params.recibidoEn,
              },
              update: {
                sesionId: params.sesionId,
                latitud: params.latitud,
                longitud: params.longitud,
                precisionM: params.precisionM,
                velocidadMps: params.velocidadMps,
                bateriaPct: params.bateriaPct,
                capturadoEn: params.capturadoEn,
                persistidoEn: params.recibidoEn,
              },
            });
          }

          const persistedSession =
            await tx.sesionTrackingUsuario.findUniqueOrThrow({
              where: { id: params.sesionId },
            });

          return {
            applied: true as const,
            duplicate: false,
            ubicacionId: location.id,
            capturadoEn: location.capturadoEn,
            recibidoEn: location.persistidoEn,
            sesion: this.mapSession(persistedSession),
          };
        }

        return { applied: false as const, reason: 'SESSION_NOT_ACTIVE' as const };
      });
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        const duplicate = await this.findIdempotentLocation(params);
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }

  async finishTracking(params: {
    usuarioId: number;
    sesionId: number;
    finalizadoEn: Date;
  }): Promise<FinishTrackingResult> {
    return this.prisma.$transaction(async (tx) => {
      for (
        let attempt = 0;
        attempt < TrackingPrismaRepository.CAS_RETRIES;
        attempt += 1
      ) {
        const session = await tx.sesionTrackingUsuario.findFirst({
          where: { id: params.sesionId, usuarioId: params.usuarioId },
        });

        if (!session) return { status: 'NOT_FOUND' as const };
        if (session.estado === EstadoSesionTracking.EXPIRADA) {
          return { status: 'EXPIRED' as const };
        }

        if (!session.asistenciaId) {
          throw new Error('La sesión de tracking no posee jornada asociada.');
        }

        if (session.estado === EstadoSesionTracking.FINALIZADA) {
          const attendance = await tx.asistencia.findUniqueOrThrow({
            where: { id: session.asistenciaId },
          });

          return {
            status: 'ALREADY_FINISHED' as const,
            asistencia: this.mapAttendance(attendance),
            sesion: this.mapSession(session),
          };
        }

        const effectiveFinish =
          params.finalizadoEn.getTime() >= session.ultimoHeartbeatEn.getTime()
            ? params.finalizadoEn
            : session.ultimoHeartbeatEn;

        const updated = await tx.sesionTrackingUsuario.updateMany({
          where: {
            id: session.id,
            usuarioId: params.usuarioId,
            estado: EstadoSesionTracking.ACTIVA,
            ultimoHeartbeatEn: session.ultimoHeartbeatEn,
          },
          data: {
            estado: EstadoSesionTracking.FINALIZADA,
            finalizadaEn: effectiveFinish,
            motivoCierre: 'MANUAL',
          },
        });

        if (updated.count !== 1) continue;

        const attendance = await tx.asistencia.update({
          where: { id: session.asistenciaId },
          data: { salida: effectiveFinish },
        });

        const persistedSession =
          await tx.sesionTrackingUsuario.findUniqueOrThrow({
            where: { id: session.id },
          });

        return {
          status: 'FINISHED' as const,
          asistencia: this.mapAttendance(attendance),
          sesion: this.mapSession(persistedSession),
        };
      }

      return { status: 'RACE_LOST' as const };
    });
  }

  async findStaleActiveSessions(params: { before: Date; limit: number }) {
    return this.prisma.sesionTrackingUsuario.findMany({
      where: {
        estado: EstadoSesionTracking.ACTIVA,
        ultimoHeartbeatEn: { lt: params.before },
      },
      orderBy: { ultimoHeartbeatEn: 'asc' },
      take: params.limit,
      select: {
        id: true,
        usuarioId: true,
        asistenciaId: true,
        iniciadaEn: true,
        ultimoHeartbeatEn: true,
      },
    });
  }

  async expireTracking(params: {
    usuarioId: number;
    sesionId: number;
    expectedHeartbeatEn: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.sesionTrackingUsuario.findFirst({
        where: { id: params.sesionId, usuarioId: params.usuarioId },
      });

      if (
        !session ||
        session.estado !== EstadoSesionTracking.ACTIVA ||
        session.ultimoHeartbeatEn.getTime() !==
          params.expectedHeartbeatEn.getTime()
      ) {
        return false;
      }

      const updated = await tx.sesionTrackingUsuario.updateMany({
        where: {
          id: params.sesionId,
          usuarioId: params.usuarioId,
          estado: EstadoSesionTracking.ACTIVA,
          ultimoHeartbeatEn: params.expectedHeartbeatEn,
        },
        data: {
          estado: EstadoSesionTracking.EXPIRADA,
          finalizadaEn: params.expectedHeartbeatEn,
          motivoCierre: 'HEARTBEAT_EXPIRADO',
        },
      });

      if (updated.count !== 1) return false;

      if (session.asistenciaId) {
        await tx.asistencia.update({
          where: { id: session.asistenciaId },
          data: { salida: params.expectedHeartbeatEn },
        });
      }

      return true;
    });
  }

  private async findIdempotentLocation(
    params: {
      usuarioId: number;
      sesionId: number;
      claveIdempotencia: string;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<RegisterLocationResult | null> {
    const existing = await client.ubicacionUsuarioHistorial.findUnique({
      where: { claveIdempotencia: params.claveIdempotencia },
      include: { sesion: true },
    });

    if (!existing) return null;

    if (
      existing.sesionId !== params.sesionId ||
      existing.sesion.usuarioId !== params.usuarioId
    ) {
      return { applied: false, reason: 'IDEMPOTENCY_COLLISION' };
    }

    return {
      applied: true,
      duplicate: true,
      ubicacionId: existing.id,
      capturadoEn: existing.capturadoEn,
      recibidoEn: existing.persistidoEn,
      sesion: this.mapSession(existing.sesion),
    };
  }

  private async runSerializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (
      let attempt = 0;
      attempt < TrackingPrismaRepository.SERIALIZABLE_RETRIES;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        lastError = error;

        if (
          !this.isPrismaCode(error, 'P2034') &&
          !this.isPrismaCode(error, 'P2002')
        ) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private isPrismaCode(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }

  private mapSession(row: {
    id: number;
    usuarioId: number;
    asistenciaId: number | null;
    estado: EstadoSesionTracking;
    iniciadaEn: Date;
    finalizadaEn: Date | null;
    ultimoHeartbeatEn: Date;
  }): TrackingSessionRecord {
    return {
      id: row.id,
      usuarioId: row.usuarioId,
      asistenciaId: row.asistenciaId,
      estado: row.estado,
      iniciadaEn: row.iniciadaEn,
      finalizadaEn: row.finalizadaEn,
      ultimoHeartbeatEn: row.ultimoHeartbeatEn,
    };
  }

  private mapAttendance(row: {
    id: number;
    usuarioId: number;
    fecha: Date;
    entrada: Date;
    salida: Date | null;
  }): TrackingAttendanceRecord {
    return {
      id: row.id,
      usuarioId: row.usuarioId,
      fecha: row.fecha,
      entrada: row.entrada,
      salida: row.salida,
    };
  }
}
