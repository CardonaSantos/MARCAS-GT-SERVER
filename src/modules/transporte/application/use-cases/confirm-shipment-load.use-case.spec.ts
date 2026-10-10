import { ConfirmShipmentLoadUseCase } from './confirm-shipment-load.use-case';

describe('ConfirmShipmentLoadUseCase', () => {
  const workflow = {
    confirmLoad: jest.fn(),
  } as any;

  const query = {
    findIdempotentOperation: jest.fn(),
    getShipment: jest.fn(),
  } as any;

  const actors = {
    findById: jest.fn(),
  } as any;

  const dispatches = {
    findById: jest.fn(),
  } as any;

  const useCase = new ConfirmShipmentLoadUseCase(
    workflow,
    query,
    actors,
    dispatches,
  );

  const actor = {
    id: 1,
    nombre: 'Bodega',
    correo: 'bodega@test.local',
    rol: 'BODEGA',
    activo: true,
    empresaId: 1,
  };

  const shipment = {
    id: 10,
    empresaId: 1,
    estado: 'ASIGNADO',
    version: 4,
    paradas: [
      {
        id: 500,
        ordenDespacho: { id: 50 },
        cargas: [
          {
            id: 700,
            ordenDespachoDetalleId: 101,
            cantidadPlanificada: 5,
            cantidadCargada: 0,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    actors.findById.mockResolvedValue(actor);
    query.findIdempotentOperation.mockResolvedValue(null);
    query.getShipment.mockResolvedValue(shipment);
    dispatches.findById.mockResolvedValue({
      id: 50,
      detalles: [
        {
          id: 101,
          productoId: 9,
          pedidoDetalleId: 8,
          cantidadProgramada: 10,
          cantidadPreparada: 10,
          cantidadDespachada: 5,
        },
      ],
    });
    workflow.confirmLoad.mockResolvedValue(undefined);
  });

  it('confirma carga cuando no excede lo físicamente despachado', async () => {
    await useCase.execute({
      id: 10,
      claveIdempotencia: 'LOAD-ENV-10-001',
      lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
      actorId: 1,
    });

    expect(workflow.confirmLoad).toHaveBeenCalledWith({
      shipmentId: 10,
      expectedVersion: 4,
      actorId: 1,
      claveIdempotencia: 'LOAD-ENV-10-001',
      lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
    });
  });

  it('repite confirmación con la misma clave sin duplicar operación', async () => {
    query.findIdempotentOperation.mockResolvedValue({
      envioId: 10,
      tipo: 'CARGA_CONFIRMADA',
    });

    await expect(
      useCase.execute({
        id: 10,
        claveIdempotencia: 'LOAD-ENV-10-001',
        lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
        actorId: 1,
      }),
    ).resolves.toBeUndefined();

    expect(query.getShipment).not.toHaveBeenCalled();
    expect(workflow.confirmLoad).not.toHaveBeenCalled();
  });

  it('rechaza reutilizar una clave de otra operación', async () => {
    query.findIdempotentOperation.mockResolvedValue({
      envioId: 99,
      tipo: 'ASIGNADO',
    });

    await expect(
      useCase.execute({
        id: 10,
        claveIdempotencia: 'LOAD-ENV-10-001',
        lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_IDEMPOTENCY_CONFLICT',
    });
  });

  it('rechaza un envío que no está ASIGNADO', async () => {
    query.getShipment.mockResolvedValue({
      ...shipment,
      estado: 'PROGRAMADO',
    });

    await expect(
      useCase.execute({
        id: 10,
        claveIdempotencia: 'LOAD-ENV-10-002',
        lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_VALIDATION_ERROR',
    });
  });

  it('rechaza cargar más de la cantidad planificada', async () => {
    await expect(
      useCase.execute({
        id: 10,
        claveIdempotencia: 'LOAD-ENV-10-003',
        lineas: [{ cargaDetalleId: 700, cantidadCargada: 6 }],
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_QUANTITY_EXCEEDED',
    });
  });

  it('rechaza cargar más de lo que Despachos sacó físicamente', async () => {
    dispatches.findById.mockResolvedValue({
      id: 50,
      detalles: [
        {
          id: 101,
          productoId: 9,
          pedidoDetalleId: 8,
          cantidadProgramada: 10,
          cantidadPreparada: 10,
          cantidadDespachada: 3,
        },
      ],
    });

    await expect(
      useCase.execute({
        id: 10,
        claveIdempotencia: 'LOAD-ENV-10-004',
        lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_QUANTITY_EXCEEDED',
    });
  });

  it('ignora líneas del envío no incluidas en el comando', async () => {
    query.getShipment.mockResolvedValue({
      ...shipment,
      paradas: [
        {
          ...shipment.paradas[0],
          cargas: [
            shipment.paradas[0].cargas[0],
            {
              id: 701,
              ordenDespachoDetalleId: 102,
              cantidadPlanificada: 2,
              cantidadCargada: 0,
            },
          ],
        },
      ],
    });

    await useCase.execute({
      id: 10,
      claveIdempotencia: 'LOAD-ENV-10-005',
      lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
      actorId: 1,
    });

    expect(workflow.confirmLoad).toHaveBeenCalledTimes(1);
  });

  it('impide a VENDEDOR confirmar carga', async () => {
    actors.findById.mockResolvedValue({
      ...actor,
      rol: 'VENDEDOR',
    });

    await expect(
      useCase.execute({
        id: 10,
        claveIdempotencia: 'LOAD-ENV-10-006',
        lineas: [{ cargaDetalleId: 700, cantidadCargada: 5 }],
        actorId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_FORBIDDEN',
    });
  });
});
