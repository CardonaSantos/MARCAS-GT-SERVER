import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { TrackingLocationEntity } from '../../domain/tracking-location.entity';
import {
  TRACKING_QUERY,
  TRACKING_REALTIME,
  TRACKING_REPOSITORY,
} from '../../tracking.tokens';
import { getTrackingBusinessDate } from '../helpers/tracking-date.helper';
import { TrackingQueryPort } from '../tracking-query.port';
import { TrackingRealtimePort } from '../tracking-realtime.port';
import { TrackingRepositoryPort } from '../tracking.repository.port';

@Injectable()
export class StartTrackingUseCase {
  private readonly logger = new Logger(StartTrackingUseCase.name);

  constructor(
    @Inject(TRACKING_REPOSITORY)
    private readonly repository: TrackingRepositoryPort,
    @Inject(TRACKING_REALTIME)
    private readonly realtime: TrackingRealtimePort,
  ) {}

  async execute(usuarioId: number) {
    assertPositiveId(usuarioId, 'usuarioId');

    const iniciadoEn = new Date();
    const fecha = getTrackingBusinessDate(iniciadoEn);

    const existing = await this.repository.findActiveSessionByUser(usuarioId);

    if (existing) {
      if (!existing.asistenciaId) {
        throw new ConflictException(
          'La sesión activa no posee una jornada asociada.',
        );
      }

      return {
        sesionTrackingId: existing.id,
        asistenciaId: existing.asistenciaId,
        estado: existing.estado,
        iniciadoEn: existing.iniciadaEn,
        ultimoHeartbeatEn: existing.ultimoHeartbeatEn,
      };
    }

    const result = await this.repository.startTracking({
      usuarioId,
      fecha,
      iniciadaEn: iniciadoEn,
    });

    if (!result.sesion.asistenciaId) {
      throw new ConflictException(
        'La sesión creada no posee una jornada asociada.',
      );
    }

    await emitStateSafely(this.logger, this.realtime, {
      usuarioId,

      tecnicoId: usuarioId,
      sesionTrackingId: result.sesion.id,
      asistenciaId: result.sesion.asistenciaId,
      estado: result.sesion.estado,
      iniciadoEn: result.sesion.iniciadaEn,
      finalizadoEn: result.sesion.finalizadaEn,
      ultimoHeartbeatEn: result.sesion.ultimoHeartbeatEn,
    });

    return {
      sesionTrackingId: result.sesion.id,
      asistenciaId: result.sesion.asistenciaId,
      estado: result.sesion.estado,
      iniciadoEn: result.sesion.iniciadaEn,
      ultimoHeartbeatEn: result.sesion.ultimoHeartbeatEn,
    };
  }
}

@Injectable()
export class GetMyTrackingStateUseCase {
  constructor(
    @Inject(TRACKING_REPOSITORY)
    private readonly repository: TrackingRepositoryPort,
  ) {}

  async execute(usuarioId: number) {
    assertPositiveId(usuarioId, 'usuarioId');

    const session = await this.repository.findActiveSessionByUser(usuarioId);

    if (!session) {
      return {
        activo: false as const,
        sesionTrackingId: null,
        asistenciaId: null,
        estado: null,
        iniciadoEn: null,
        ultimoHeartbeatEn: null,
      };
    }

    if (!session.asistenciaId) {
      throw new ConflictException(
        'La sesión activa no posee una jornada asociada.',
      );
    }

    return {
      activo: true as const,
      sesionTrackingId: session.id,
      asistenciaId: session.asistenciaId,
      estado: session.estado,
      iniciadoEn: session.iniciadaEn,
      ultimoHeartbeatEn: session.ultimoHeartbeatEn,
    };
  }
}

export type RegisterTrackingLocationCommand = {
  usuarioId: number;
  sesionTrackingId: number;
  claveIdempotencia?: string | null;
  latitud: number;
  longitud: number;
  precision?: number | null;
  velocidad?: number | null;
  bateria?: number | null;
  capturadoEn: string | Date;
};

@Injectable()
export class RegisterTrackingLocationUseCase {
  private readonly logger = new Logger(RegisterTrackingLocationUseCase.name);

  constructor(
    @Inject(TRACKING_REPOSITORY)
    private readonly repository: TrackingRepositoryPort,
    @Inject(TRACKING_QUERY)
    private readonly query: TrackingQueryPort,
    @Inject(TRACKING_REALTIME)
    private readonly realtime: TrackingRealtimePort,
  ) {}

  async execute(command: RegisterTrackingLocationCommand) {
    assertPositiveId(command.usuarioId, 'usuarioId');
    assertPositiveId(command.sesionTrackingId, 'sesionTrackingId');

    const capturadoEn = new Date(command.capturadoEn);

    if (Number.isNaN(capturadoEn.getTime())) {
      throw new BadRequestException(
        'capturadoEn debe contener una fecha válida.',
      );
    }

    const claveIdempotencia = this.resolveIdempotencyKey({
      ...command,
      capturadoEn,
    });

    let location: TrackingLocationEntity;

    try {
      location = TrackingLocationEntity.create({
        sesionId: command.sesionTrackingId,
        claveIdempotencia,
        latitud: command.latitud,
        longitud: command.longitud,
        precisionM: command.precision ?? null,
        velocidadMps: command.velocidad ?? null,
        bateriaPct: command.bateria ?? null,
        capturadoEn,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Ubicación inválida.',
      );
    }

    const point = location.toPrimitives();
    const recibidoEn = new Date();

    const persisted = await this.repository.registerLocation({
      usuarioId: command.usuarioId,
      sesionId: point.sesionId,
      claveIdempotencia: point.claveIdempotencia,
      latitud: point.latitud,
      longitud: point.longitud,
      precisionM: point.precisionM,
      velocidadMps: point.velocidadMps,
      bateriaPct: point.bateriaPct,
      capturadoEn: point.capturadoEn,
      recibidoEn,
    });

    if ('reason' in persisted) {
      if (persisted.reason === 'SESSION_NOT_FOUND') {
        throw new NotFoundException(
          'No se encontró la sesión de tracking del usuario autenticado.',
        );
      }

      if (persisted.reason === 'IDEMPOTENCY_COLLISION') {
        throw new ConflictException(
          'La clave de idempotencia ya pertenece a otra ubicación.',
        );
      }

      throw new ConflictException(
        'La sesión de tracking ya no está activa.',
      );
    }

    if (!persisted.duplicate) {
      await this.emitLocationSafely(command.usuarioId);
    }

    return {
      ubicacionId: persisted.ubicacionId,
      sesionTrackingId: command.sesionTrackingId,
      estado: persisted.sesion.estado,
      capturadoEn: persisted.capturadoEn,
      recibidoEn: persisted.recibidoEn,
      ultimoHeartbeatEn: persisted.sesion.ultimoHeartbeatEn,
    };
  }

  private resolveIdempotencyKey(
    command: RegisterTrackingLocationCommand & { capturadoEn: Date },
  ): string {
    const explicit = command.claveIdempotencia?.trim();

    if (explicit) return explicit;

    const fingerprint = JSON.stringify({
      sesionTrackingId: command.sesionTrackingId,
      capturadoEn: command.capturadoEn.toISOString(),
      latitud: command.latitud,
      longitud: command.longitud,
      precision: command.precision ?? null,
      velocidad: command.velocidad ?? null,
      bateria: command.bateria ?? null,
    });

    return (
      'apk-auto:' +
      createHash('sha256').update(fingerprint).digest('hex')
    );
  }

  private async emitLocationSafely(usuarioId: number): Promise<void> {
    try {
      const view = await this.query.findRealtimeByUser(usuarioId);
      if (view) await this.realtime.emitLocationUpdated(view);
    } catch (error) {
      this.logger.error(
        'El GPS fue persistido, pero no pudo emitirse por realtime.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

@Injectable()
export class FinishTrackingUseCase {
  private readonly logger = new Logger(FinishTrackingUseCase.name);

  constructor(
    @Inject(TRACKING_REPOSITORY)
    private readonly repository: TrackingRepositoryPort,
    @Inject(TRACKING_REALTIME)
    private readonly realtime: TrackingRealtimePort,
  ) {}

  async execute(usuarioId: number, sesionId: number) {
    assertPositiveId(usuarioId, 'usuarioId');
    assertPositiveId(sesionId, 'sesionTrackingId');

    const result = await this.repository.finishTracking({
      usuarioId,
      sesionId,
      finalizadoEn: new Date(),
    });

    if (!('sesion' in result)) {
      if (result.status === 'NOT_FOUND') {
        throw new NotFoundException(
          'No se encontró la sesión de tracking del usuario autenticado.',
        );
      }

      if (result.status === 'EXPIRED') {
        throw new ConflictException(
          'La sesión de tracking ya expiró y no puede finalizarse manualmente.',
        );
      }

      throw new ConflictException(
        'La sesión cambió mientras se procesaba la finalización.',
      );
    }

    const finalizadoEn = result.sesion.finalizadaEn;

    if (!finalizadoEn || !result.sesion.asistenciaId) {
      throw new ConflictException(
        'La sesión finalizada quedó en un estado inconsistente.',
      );
    }

    if (result.status === 'FINISHED') {
      await emitStateSafely(this.logger, this.realtime, {
        usuarioId,

        tecnicoId: usuarioId,
        sesionTrackingId: result.sesion.id,
        asistenciaId: result.sesion.asistenciaId,
        estado: result.sesion.estado,
        iniciadoEn: result.sesion.iniciadaEn,
        finalizadoEn,
        ultimoHeartbeatEn: result.sesion.ultimoHeartbeatEn,
      });
    }

    return {
      sesionTrackingId: result.sesion.id,
      asistenciaId: result.sesion.asistenciaId,
      estado: result.sesion.estado,
      iniciadoEn: result.sesion.iniciadaEn,
      finalizadoEn,
      ultimoHeartbeatEn: result.sesion.ultimoHeartbeatEn,
      duracionMinutos: Math.max(
        0,
        Math.floor(
          (finalizadoEn.getTime() - result.sesion.iniciadaEn.getTime()) /
            60_000,
        ),
      ),
      horaEntrada: result.asistencia.entrada,
      horaSalida: result.asistencia.salida ?? finalizadoEn,
    };
  }
}

@Injectable()
export class ExpireTrackingUseCase {
  private readonly logger = new Logger(ExpireTrackingUseCase.name);

  constructor(
    @Inject(TRACKING_REPOSITORY)
    private readonly repository: TrackingRepositoryPort,
    @Inject(TRACKING_REALTIME)
    private readonly realtime: TrackingRealtimePort,
  ) {}

  async execute(before: Date, limit = 200): Promise<number> {
    const stale = await this.repository.findStaleActiveSessions({
      before,
      limit,
    });

    let expired = 0;

    for (const session of stale) {
      const applied = await this.repository.expireTracking({
        usuarioId: session.usuarioId,
        sesionId: session.id,
        expectedHeartbeatEn: session.ultimoHeartbeatEn,
      });

      if (!applied || !session.asistenciaId) continue;

      expired += 1;

      await emitStateSafely(this.logger, this.realtime, {
        usuarioId: session.usuarioId,

        tecnicoId: session.usuarioId,
        sesionTrackingId: session.id,
        asistenciaId: session.asistenciaId,
        estado: 'EXPIRADA',
        iniciadoEn: session.iniciadaEn,
        finalizadoEn: session.ultimoHeartbeatEn,
        ultimoHeartbeatEn: session.ultimoHeartbeatEn,
      });
    }

    return expired;
  }
}

function assertPositiveId(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(field + ' debe ser un entero positivo.');
  }
}

async function emitStateSafely(
  logger: Logger,
  realtime: TrackingRealtimePort,
  payload: Parameters<TrackingRealtimePort['emitTrackingStateChanged']>[0],
): Promise<void> {
  try {
    await realtime.emitTrackingStateChanged(payload);
  } catch (error) {
    logger.error(
      'No pudo emitirse el cambio de estado de tracking.',
      error instanceof Error ? error.stack : String(error),
    );
  }
}
