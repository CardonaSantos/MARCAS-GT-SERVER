import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_DASHBOARD_SECTIONS,
  AdminDashboardView,
  DashboardFilters,
  DashboardScope,
  DashboardSectionResult,
} from '../../domain/dashboard.models';
import { DASHBOARD_QUERY, DashboardQueryPort } from '../ports/dashboard-query.port';

const ZONE_OFFSET_HOURS = 6; // Guatemala no usa horario de verano.

/** Fecha local de Guatemala. Limita el período a un año para evitar consultas masivas. */
export function buildDashboardScope(
  empresaId: number,
  filters: DashboardFilters,
  now = new Date(),
): DashboardScope {
  const guatemalaToday = new Date(now.getTime() - ZONE_OFFSET_HOURS * 3600000)
    .toISOString().slice(0, 10);
  const defaultDesde = new Date(Date.parse(guatemalaToday + 'T00:00:00Z') - 29 * 86400000)
    .toISOString().slice(0, 10);
  const from = filters.desde ?? defaultDesde;
  const to = filters.hasta ?? guatemalaToday;
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const ms = Date.parse(value + 'T00:00:00.000Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
  };
  if (!valid(from) || !valid(to)) {
    throw new DashboardRangeError('Las fechas deben ser días reales YYYY-MM-DD.');
  }
  const fromUtc = Date.parse(from + 'T00:00:00Z');
  const toUtc = Date.parse(to + 'T00:00:00Z');
  if (fromUtc > toUtc || toUtc - fromUtc > 365 * 86400000) {
    throw new DashboardRangeError('El período debe estar ordenado y ser de hasta 365 días.');
  }
  return {
    empresaId,
    now,
    desde: new Date(fromUtc + ZONE_OFFSET_HOURS * 3600000),
    hasta: new Date(toUtc + (ZONE_OFFSET_HOURS + 24) * 3600000),
    limit: filters.limit ?? 10,
  };
}

export class DashboardRangeError extends Error {}

@Injectable()
export class AdminDashboardReader {
  private readonly logger = new Logger(AdminDashboardReader.name);

  constructor(@Inject(DASHBOARD_QUERY) private readonly query: DashboardQueryPort) {}

  async execute(view: AdminDashboardView, actorId: number, filters: DashboardFilters = {}) {
    // Nunca esconder problemas de autenticación, autorización o empresa.
    const empresaId = await this.query.getEmpresaId(actorId);
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      throw new ForbiddenException('El usuario no tiene empresa asignada.');
    }
    const scope = buildDashboardScope(empresaId, filters);
    const sections = ADMIN_DASHBOARD_SECTIONS[view];
    const results = await Promise.allSettled(
      sections.map((id) => this.withTimeout(this.query.read(id, scope), 6000)),
    );
    const data: Record<string, DashboardSectionResult> = {};
    results.forEach((result, index) => {
      const id = sections[index];
      if (result.status === 'fulfilled') {
        data[id] = { status: 'OK', data: result.value };
      } else {
        this.logger.warn(`Dashboard ${view}/${id} unavailable for empresa=${empresaId}: ${String(result.reason)}`);
        data[id] = { status: 'UNAVAILABLE', data: null };
      }
    });
    return {
      view,
      empresaId,
      generatedAt: scope.now.toISOString(),
      timezone: 'America/Guatemala',
      period: {
        desde: new Date(scope.desde.getTime() - ZONE_OFFSET_HOURS * 3600000).toISOString().slice(0, 10),
        hasta: new Date(scope.hasta.getTime() - (ZONE_OFFSET_HOURS + 24) * 3600000).toISOString().slice(0, 10),
      },
      partial: Object.values(data).some((v) => v.status !== 'OK'),
      sections: data,
    };
  }

  private withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Dashboard section timeout')), ms);
      task.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    });
  }
}

@Injectable()
export class GetAdminOverviewUseCase {
  constructor(private readonly reader: AdminDashboardReader) {}
  execute(actorId: number, filters: DashboardFilters) { return this.reader.execute('resumen', actorId, filters); }
}
@Injectable()
export class GetAdminAlertsUseCase {
  constructor(private readonly reader: AdminDashboardReader) {}
  execute(actorId: number, filters: DashboardFilters) { return this.reader.execute('alertas', actorId, filters); }
}
@Injectable()
export class GetAdminAgendaUseCase {
  constructor(private readonly reader: AdminDashboardReader) {}
  execute(actorId: number, filters: DashboardFilters) { return this.reader.execute('agenda', actorId, filters); }
}
@Injectable()
export class GetAdminChartsUseCase {
  constructor(private readonly reader: AdminDashboardReader) {}
  execute(actorId: number, filters: DashboardFilters) { return this.reader.execute('graficos', actorId, filters); }
}
@Injectable()
export class GetAdminActivityUseCase {
  constructor(private readonly reader: AdminDashboardReader) {}
  execute(actorId: number, filters: DashboardFilters) { return this.reader.execute('actividad', actorId, filters); }
}
@Injectable()
export class GetAdminLiveUseCase {
  constructor(private readonly reader: AdminDashboardReader) {}
  execute(actorId: number, filters: DashboardFilters) { return this.reader.execute('live', actorId, filters); }
}
