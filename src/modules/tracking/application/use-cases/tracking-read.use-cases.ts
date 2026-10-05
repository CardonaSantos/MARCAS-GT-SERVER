import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TRACKING_QUERY } from '../../tracking.tokens';
import { TrackingHistoryFilters, TrackingQueryPort } from '../tracking-query.port';

@Injectable()
export class ListTrackingRealtimeUseCase {
  constructor(@Inject(TRACKING_QUERY) private readonly query: TrackingQueryPort) {}
  execute() { return this.query.listRealtime(); }
}

@Injectable()
export class ListTrackingHistoryUseCase {
  constructor(@Inject(TRACKING_QUERY) private readonly query: TrackingQueryPort) {}
  execute(filters: TrackingHistoryFilters) { return this.query.listHistory(filters); }
}

@Injectable()
export class GetTrackingAttendanceDetailUseCase {
  constructor(@Inject(TRACKING_QUERY) private readonly query: TrackingQueryPort) {}
  async execute(asistenciaId: number) {
    const result = await this.query.getAttendanceDetail(asistenciaId);
    if (!result) throw new NotFoundException('No se encontró la jornada solicitada.');
    return result;
  }
}

@Injectable()
export class ListTrackingAttendanceLocationsUseCase {
  constructor(@Inject(TRACKING_QUERY) private readonly query: TrackingQueryPort) {}
  execute(params: { asistenciaId: number; sesionId?: number | null; page: number; limit: number }) {
    return this.query.listAttendanceLocations(params);
  }
}
