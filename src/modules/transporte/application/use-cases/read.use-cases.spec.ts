import {
  ListShipmentEventsUseCase,
  ListShipmentIncidentsUseCase,
} from './read.use-cases';

describe('transport read history use cases', () => {
  const query = {
    listEvents: jest.fn(),
    listIncidents: jest.fn(),
  } as any;

  const actors = {
    findById: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista eventos paginados aplicando el scope del actor', async () => {
    actors.findById.mockResolvedValue({
      id: 1,
      nombre: 'Admin',
      correo: 'admin@test.local',
      rol: 'ADMIN',
      activo: true,
      empresaId: 5,
    });
    query.listEvents.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 2, limit: 10, totalPages: 0 },
    });

    const useCase = new ListShipmentEventsUseCase(query, actors);

    await useCase.execute(12, { page: 2, limit: 10 }, 1);

    expect(query.listEvents).toHaveBeenCalledWith(
      12,
      { empresaId: 5, rol: 'ADMIN' },
      2,
      10,
    );
  });

  it('lista incidencias preservando scope de repartidor y filtro de estado', async () => {
    actors.findById.mockResolvedValue({
      id: 9,
      nombre: 'Repartidor',
      correo: 'repartidor@test.local',
      rol: 'REPARTIDOR',
      activo: true,
      empresaId: 5,
    });
    query.listIncidents.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });

    const useCase = new ListShipmentIncidentsUseCase(query, actors);

    await useCase.execute(
      12,
      { page: 1, limit: 20, estado: 'ABIERTA' },
      9,
    );

    expect(query.listIncidents).toHaveBeenCalledWith(
      12,
      {
        empresaId: 5,
        rol: 'REPARTIDOR',
        responsableId: 9,
      },
      1,
      20,
      'ABIERTA',
    );
  });
});
