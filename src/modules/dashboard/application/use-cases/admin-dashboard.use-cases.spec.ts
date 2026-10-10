import { ForbiddenException } from '@nestjs/common';
import { ADMIN_DASHBOARD_SECTIONS } from '../../domain/dashboard.models';
import { DashboardQueryPort } from '../ports/dashboard-query.port';
import {
  AdminDashboardReader, buildDashboardScope, DashboardRangeError,
} from './admin-dashboard.use-cases';

describe('Admin dashboard — aislamiento de secciones', () => {
  const fake = (): jest.Mocked<DashboardQueryPort> => ({
    getEmpresaId: jest.fn().mockResolvedValue(5),
    read: jest.fn().mockResolvedValue({ total: 0, items: [] }),
  });
  const fixed = new Date('2026-10-09T12:00:00.000Z');

  it('no confunde ausencia de registros con un fallo', async () => {
    const port = fake();
    const result = await new AdminDashboardReader(port).execute('agenda', 41, {});
    expect(result.partial).toBe(false);
    expect(Object.keys(result.sections)).toEqual([...ADMIN_DASHBOARD_SECTIONS.agenda]);
    expect(result.sections.proximosCobros).toEqual({
      status: 'OK', data: { total: 0, items: [] },
    });
    expect(port.getEmpresaId).toHaveBeenCalledWith(41);
    expect(port.read).toHaveBeenCalledWith('proximosCobros', expect.objectContaining({ empresaId: 5 }));
  });

  it('devuelve sólo el bloque roto como UNAVAILABLE y mantiene el resto', async () => {
    const port = fake();
    port.read.mockImplementation(async id => {
      if (id === 'cuotasVencidas') throw new Error('Database temporarily unavailable');
      return { total: 0, items: [] };
    });
    const result = await new AdminDashboardReader(port).execute('alertas', 41, {});
    expect(result.partial).toBe(true);
    expect(result.sections.cuotasVencidas).toEqual({ status: 'UNAVAILABLE', data: null });
    expect(result.sections.pagosPorVerificar.status).toBe('OK');
    expect(result.sections.incideciasTransporte).toBeUndefined();
    expect(result.sections.incidenciasTransporte.status).toBe('OK');
  });

  it('no tapa fallos de seguridad ni ejecuta consultas si falta empresa', async () => {
    const port = fake();
    port.getEmpresaId.mockResolvedValue(0);
    await expect(new AdminDashboardReader(port).execute('resumen', 41, {}))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(port.read).not.toHaveBeenCalled();
    port.getEmpresaId.mockRejectedValue(new ForbiddenException());
    await expect(new AdminDashboardReader(port).execute('live', 41, {}))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('usa la fecha de Guatemala y un período local inclusivo', () => {
    const scope = buildDashboardScope(5, {}, fixed);
    expect(scope.desde.toISOString()).toBe('2026-09-10T06:00:00.000Z');
    expect(scope.hasta.toISOString()).toBe('2026-10-10T06:00:00.000Z');
    expect(scope.limit).toBe(10);
    const custom = buildDashboardScope(5, { desde: '2026-10-01', hasta: '2026-10-02', limit: 5 }, fixed);
    expect(custom.desde.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(custom.hasta.toISOString()).toBe('2026-10-03T06:00:00.000Z');
  });

  it('rechaza rangos inválidos antes de acceder a datos', async () => {
    expect(() => buildDashboardScope(5, { desde: '2026-10-09', hasta: '2026-10-08' }, fixed))
      .toThrow(DashboardRangeError);
    expect(() => buildDashboardScope(5, { desde: '2026-01-01', hasta: '2026-10-08' }, fixed))
      .not.toThrow();
    expect(() => buildDashboardScope(5, { desde: '2026-02-30' }, fixed))
      .toThrow(DashboardRangeError);
    expect(() => buildDashboardScope(5, { desde: '2025-01-01' }, fixed))
      .toThrow(DashboardRangeError);
  });

  it.each(['resumen','alertas','agenda','graficos','actividad','live'] as const)(
    'mantiene un contrato consistente para %s', async view => {
      const port = fake();
      const value = await new AdminDashboardReader(port).execute(view, 1, {});
      expect(value.view).toBe(view);
      expect(value.timezone).toBe('America/Guatemala');
      expect(value.partial).toBe(false);
      expect(Object.keys(value.sections)).toEqual([...ADMIN_DASHBOARD_SECTIONS[view]]);
    },
  );
});
