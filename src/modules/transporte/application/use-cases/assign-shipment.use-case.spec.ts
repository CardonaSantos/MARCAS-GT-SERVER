import { AssignShipmentUseCase } from './assign-shipment.use-case';

describe('AssignShipmentUseCase', () => {
  const workflow = {
    assignResources: jest.fn(),
  } as any;

  const catalog = {
    findVehicle: jest.fn(),
    findDriver: jest.fn(),
    findCarrier: jest.fn(),
  } as any;

  const query = {
    getShipmentState: jest.fn(),
  } as any;

  const actors = {
    findById: jest.fn(),
  } as any;

  const useCase = new AssignShipmentUseCase(
    workflow,
    catalog,
    query,
    actors,
  );

  const admin = {
    id: 1,
    nombre: 'Admin',
    correo: 'admin@test.local',
    rol: 'ADMIN',
    activo: true,
    empresaId: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    actors.findById.mockImplementation(async (id: number) => {
      if (id === 1) return admin;
      if (id === 77) {
        return {
          id: 77,
          nombre: 'Repartidor',
          correo: 'r@test.local',
          rol: 'REPARTIDOR',
          activo: true,
          empresaId: 10,
        };
      }
      return null;
    });
    query.getShipmentState.mockResolvedValue({
      id: 5,
      estado: 'PROGRAMADO',
      modalidad: 'INTERNO',
      version: 3,
      bodegaId: 2,
      vehiculoId: null,
      conductorId: null,
      responsableId: null,
    });
    catalog.findVehicle.mockResolvedValue({
      id: 30,
      empresaId: 10,
      estado: 'DISPONIBLE',
      activo: true,
      version: 2,
    });
    catalog.findDriver.mockResolvedValue({
      id: 40,
      empresaId: 10,
      estado: 'DISPONIBLE',
      activo: true,
      version: 1,
    });
    workflow.assignResources.mockResolvedValue(undefined);
  });

  it('asigna recursos internos válidos y preserva expectedVersion', async () => {
    await useCase.execute({
      id: 5,
      vehiculoId: 30,
      conductorId: 40,
      responsableId: 77,
      claveIdempotencia: 'ASSIGN-ENV-5-001',
      actorId: 1,
    });

    expect(workflow.assignResources).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentId: 5,
        expectedVersion: 3,
        actorId: 1,
        modalidad: 'INTERNO',
        vehiculoId: 30,
        conductorId: 40,
        responsableId: 77,
        claveIdempotencia: 'ASSIGN-ENV-5-001',
      }),
    );
  });

  it('rechaza envío inexistente', async () => {
    query.getShipmentState.mockResolvedValue(null);

    await expect(
      useCase.execute({
        id: 999,
        vehiculoId: 30,
        conductorId: 40,
        responsableId: 77,
        claveIdempotencia: 'ASSIGN-ENV-999',
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_NOT_FOUND',
    });
  });

  it('rechaza asignación cuando el envío ya no está PROGRAMADO', async () => {
    query.getShipmentState.mockResolvedValue({
      id: 5,
      estado: 'ASIGNADO',
      modalidad: 'INTERNO',
      version: 4,
      responsableId: 77,
    });

    await expect(
      useCase.execute({
        id: 5,
        vehiculoId: 30,
        conductorId: 40,
        responsableId: 77,
        claveIdempotencia: 'ASSIGN-ENV-5-002',
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_VALIDATION_ERROR',
    });
  });

  it('un envío interno requiere vehículo, conductor y responsable', async () => {
    await expect(
      useCase.execute({
        id: 5,
        vehiculoId: 30,
        conductorId: 40,
        claveIdempotencia: 'ASSIGN-ENV-5-003',
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_VALIDATION_ERROR',
    });
  });

  it('rechaza vehículo no disponible', async () => {
    catalog.findVehicle.mockResolvedValue({
      id: 30,
      empresaId: 10,
      estado: 'EN_RUTA',
      activo: true,
      version: 2,
    });

    await expect(
      useCase.execute({
        id: 5,
        vehiculoId: 30,
        conductorId: 40,
        responsableId: 77,
        claveIdempotencia: 'ASSIGN-ENV-5-004',
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_RESOURCE_UNAVAILABLE',
    });
  });

  it('rechaza conductor no disponible', async () => {
    catalog.findDriver.mockResolvedValue({
      id: 40,
      empresaId: 10,
      estado: 'EN_RUTA',
      activo: true,
      version: 1,
    });

    await expect(
      useCase.execute({
        id: 5,
        vehiculoId: 30,
        conductorId: 40,
        responsableId: 77,
        claveIdempotencia: 'ASSIGN-ENV-5-005',
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_RESOURCE_UNAVAILABLE',
    });
  });

  it('rechaza responsable de otra empresa', async () => {
    actors.findById.mockImplementation(async (id: number) => {
      if (id === 1) return admin;
      return {
        id,
        nombre: 'Otro',
        correo: 'otro@test.local',
        rol: 'REPARTIDOR',
        activo: true,
        empresaId: 999,
      };
    });

    await expect(
      useCase.execute({
        id: 5,
        vehiculoId: 30,
        conductorId: 40,
        responsableId: 77,
        claveIdempotencia: 'ASSIGN-ENV-5-006',
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_RESOURCE_UNAVAILABLE',
    });
  });

  it('para EXTERNO requiere transportista EXTERNO activo de la empresa', async () => {
    query.getShipmentState.mockResolvedValue({
      id: 8,
      estado: 'PROGRAMADO',
      modalidad: 'EXTERNO',
      version: 0,
      bodegaId: 2,
      responsableId: null,
    });
    catalog.findCarrier.mockResolvedValue({
      id: 90,
      empresaId: 10,
      tipo: 'EXTERNO',
      activo: true,
      version: 0,
    });

    await useCase.execute({
      id: 8,
      transportistaId: 90,
      claveIdempotencia: 'ASSIGN-EXT-8-001',
      actorId: 1,
    });

    expect(workflow.assignResources).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentId: 8,
        modalidad: 'EXTERNO',
        transportistaId: 90,
      }),
    );
  });

  it('rechaza transportista INTERNO para envío EXTERNO', async () => {
    query.getShipmentState.mockResolvedValue({
      id: 8,
      estado: 'PROGRAMADO',
      modalidad: 'EXTERNO',
      version: 0,
      bodegaId: 2,
      responsableId: null,
    });
    catalog.findCarrier.mockResolvedValue({
      id: 90,
      empresaId: 10,
      tipo: 'INTERNO',
      activo: true,
      version: 0,
    });

    await expect(
      useCase.execute({
        id: 8,
        transportistaId: 90,
        claveIdempotencia: 'ASSIGN-EXT-8-002',
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_RESOURCE_UNAVAILABLE',
    });
  });
});
