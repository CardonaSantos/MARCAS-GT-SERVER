import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchQueryPort } from '../ports/dispatch-query.port';
import { GetDispatchOperationalReportUseCase } from './get-dispatch-operational-report.use-case';
import { GetDispatchSummaryUseCase } from './get-dispatch-summary.use-case';
import { GetDispatchUseCase } from './get-dispatch.use-case';
import { ListDispatchCandidatesUseCase } from './list-dispatch-candidates.use-case';
import { ListDispatchesUseCase } from './list-dispatches.use-case';

function actorDirectory(
  role: 'ADMIN' | 'VENDEDOR',
  id = role === 'VENDEDOR' ? 8 : 1,
): DispatchActorDirectoryPort {
  return {
    findById: async () => ({
      id,
      nombre: role,
      correo: `${role.toLowerCase()}@test.gt`,
      rol: role,
      activo: true,
      empresaId: 9,
    }),
  };
}

function queryMock() {
  return {
    listCandidates: jest.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    }),
    list: jest.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    }),
    getById: jest.fn().mockResolvedValue({
      id: 50,
    }),
    listEvents: jest.fn(),
    listOperations: jest.fn(),
    getSummary: jest.fn().mockResolvedValue({}),
    getOperationalReport: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<DispatchQueryPort>;
}

describe('Dispatch read scope', () => {
  it('fuerza al VENDEDOR a listar únicamente sus propios pedidos', async () => {
    const query = queryMock();
    const useCase = new ListDispatchesUseCase(
      query,
      actorDirectory('VENDEDOR', 8),
    );

    await useCase.execute(
      {
        page: 1,
        limit: 20,
        vendedorId: 999,
        sortBy: 'creadoEn',
        sortDir: 'desc',
      },
      8,
    );

    expect(query.list).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 9,
        vendedorId: 8,
      }),
    );
  });

  it('fuerza el scope del VENDEDOR también en candidatos', async () => {
    const query = queryMock();
    const useCase = new ListDispatchCandidatesUseCase(
      query,
      actorDirectory('VENDEDOR', 8),
    );

    await useCase.execute(
      {
        page: 1,
        limit: 20,
        vendedorId: 999,
      },
      8,
    );

    expect(query.listCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 9,
        vendedorId: 8,
      }),
    );
  });

  it('GET detalle envía empresa, vendedor y rol al query adapter', async () => {
    const query = queryMock();
    const useCase = new GetDispatchUseCase(
      query,
      actorDirectory('VENDEDOR', 8),
    );

    await useCase.execute(50, 8);

    expect(query.getById).toHaveBeenCalledWith(50, {
      empresaId: 9,
      vendedorId: 8,
      rol: 'VENDEDOR',
    });
  });

  it('el resumen del VENDEDOR queda limitado a su propia cartera', async () => {
    const query = queryMock();
    const useCase = new GetDispatchSummaryUseCase(
      query,
      actorDirectory('VENDEDOR', 8),
    );

    await useCase.execute({}, 8);

    expect(query.getSummary).toHaveBeenCalledWith({
      empresaId: 9,
      vendedorId: 8,
    });
  });

  it('la reportería operacional del VENDEDOR también queda limitada', async () => {
    const query = queryMock();
    const useCase = new GetDispatchOperationalReportUseCase(
      query,
      actorDirectory('VENDEDOR', 8),
    );

    await useCase.execute({}, 8);

    expect(query.getOperationalReport).toHaveBeenCalledWith({
      empresaId: 9,
      vendedorId: 8,
    });
  });

  it('ADMIN conserva filtro explícito de vendedor cuando lo solicita', async () => {
    const query = queryMock();
    const useCase = new ListDispatchesUseCase(
      query,
      actorDirectory('ADMIN', 1),
    );

    await useCase.execute(
      {
        page: 1,
        limit: 20,
        vendedorId: 12,
        sortBy: 'creadoEn',
        sortDir: 'desc',
      },
      1,
    );

    expect(query.list).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 9,
        vendedorId: 12,
      }),
    );
  });
});
