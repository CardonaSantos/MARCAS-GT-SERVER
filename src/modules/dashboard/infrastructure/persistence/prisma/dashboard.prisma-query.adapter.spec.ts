import { ForbiddenException } from '@nestjs/common';
import { DashboardPrismaQueryAdapter } from './dashboard.prisma-query.adapter';
import { DashboardScope } from '../../../domain/dashboard.models';

describe('DashboardPrismaQueryAdapter — seguridad y datos vacíos', () => {
  const scope: DashboardScope = {
    empresaId: 9,
    now: new Date('2026-10-09T12:00:00Z'),
    desde: new Date('2026-10-01T06:00:00Z'),
    hasta: new Date('2026-10-10T06:00:00Z'),
    limit: 10,
  };

  it('rechaza usuarios sin empresa, inactivos y no ADMIN', async () => {
    const db = { usuario: { findUnique: jest.fn() } };
    const port = new DashboardPrismaQueryAdapter(db as any);
    for (const usuario of [
      null,
      { activo: true, rol: 'VENDEDOR', empresaId: 9 },
      { activo: false, rol: 'ADMIN', empresaId: 9 },
      { activo: true, rol: 'ADMIN', empresaId: null },
    ]) {
      db.usuario.findUnique.mockResolvedValue(usuario);
      await expect(port.getEmpresaId(24)).rejects.toBeInstanceOf(ForbiddenException);
    }
    db.usuario.findUnique.mockResolvedValue({ activo: true, rol: 'ADMIN', empresaId: 9 });
    expect(await port.getEmpresaId(24)).toBe(9);
  });

  it('no carga datos globales de otras empresas para saldo y próximos vencimientos', async () => {
    const db = {
      cuentaPorCobrar: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { saldoPendiente: null }, _count: { _all: 0 } }),
      },
      creditoPlanPago: { count: jest.fn().mockResolvedValue(0) },
    };
    const port = new DashboardPrismaQueryAdapter(db as any);
    const result = await port.read('cartera', scope);
    expect(result).toEqual({
      pendiente: '0.00', cuentasAbiertas: 0, vencido: '0.00',
      cuentasVencidas: 0, porVencer7Dias: '0.00', vencimientos7Dias: 0,
      planesSinActivar: 0,
    });
    expect(db.cuentaPorCobrar.aggregate).toHaveBeenCalledTimes(3);
    for (const call of db.cuentaPorCobrar.aggregate.mock.calls) {
      expect(call[0].where.empresaId).toBe(9);
    }
    expect(db.creditoPlanPago.count).toHaveBeenCalledWith({ where: { empresaId: 9, estado: 'BORRADOR' } });
  });

  it('mantiene valores cero cuando no hay pedidos', async () => {
    const db = {
      pedido: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: null }, _count: { _all: 0 } }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const result = await new DashboardPrismaQueryAdapter(db as any).read('pedidos', scope);
    expect(result).toEqual({
      pedidosPeriodo: 0, valorNetoPedidos: '0.00',
      porValidar: 0, pendientesDeSalida: 0,
    });
    expect(db.pedido.aggregate.mock.calls[0][0].where.empresaId).toBe(9);
  });
});
