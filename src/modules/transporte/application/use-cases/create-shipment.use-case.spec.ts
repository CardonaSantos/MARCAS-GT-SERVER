import { CreateShipmentUseCase } from './create-shipment.use-case';

describe('CreateShipmentUseCase', () => {
  const workflow = {
    createShipment: jest.fn(),
  } as any;

  const actors = {
    findById: jest.fn(),
  } as any;

  const bodegas = {
    findById: jest.fn(),
  } as any;

  const dispatches = {
    findTransportPlanningById: jest.fn(),
  } as any;

  const useCase = new CreateShipmentUseCase(
    workflow,
    actors,
    bodegas,
    dispatches,
  );

  const actor = {
    id: 7,
    nombre: 'Admin',
    correo: 'admin@test.local',
    rol: 'ADMIN',
    activo: true,
    empresaId: 1,
  };

  const dispatch = {
    id: 50,
    numero: 'DSP-000050',
    pedidoId: 40,
    empresaId: 1,
    bodegaId: 3,
    estado: 'PREPARADA',
    programadoEn: null,
    preparadoEn: new Date(),
    despachadoEn: null,
    vendedorId: 9,
    cliente: {
      id: 22,
      nombre: 'Carlos',
      apellido: 'López',
      telefono: '5555',
    },
    destino: {
      destinatario: 'Carlos López',
      telefono: '5555',
      direccion: 'Zona 1',
      latitud: 15.67,
      longitud: -91.71,
    },
    detalles: [
      {
        id: 101,
        pedidoDetalleId: 90,
        productoId: 12,
        cantidadProgramada: 10,
        cantidadPreparada: 10,
        cantidadDespachada: 0,
      },
    ],
  };

  const command = {
    bodegaId: 3,
    modalidad: 'INTERNO',
    salidaProgramadaEn: new Date('2026-10-01T14:00:00.000Z'),
    paradas: [
      {
        ordenDespachoId: 50,
        secuencia: 1,
        cargas: [
          {
            ordenDespachoDetalleId: 101,
            cantidadPlanificada: 6,
          },
        ],
      },
    ],
    actorId: 7,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    actors.findById.mockResolvedValue(actor);
    bodegas.findById.mockResolvedValue({
      id: 3,
      empresaId: 1,
      activo: true,
      nombre: 'Bodega Central',
    });
    dispatches.findTransportPlanningById.mockResolvedValue(dispatch);
    workflow.createShipment.mockResolvedValue({
      id: 100,
      numero: 'ENV-000100',
    });
  });

  it('crea un envío y genera snapshot del destino desde Despachos', async () => {
    const result = await useCase.execute(command as any);

    expect(result).toEqual({ id: 100, numero: 'ENV-000100' });
    expect(workflow.createShipment).toHaveBeenCalledTimes(1);

    const payload = workflow.createShipment.mock.calls[0][0];

    expect(payload).toEqual(
      expect.objectContaining({
        empresaId: 1,
        bodegaId: 3,
        modalidad: 'INTERNO',
        creadoPorId: 7,
      }),
    );

    expect(payload.paradas[0]).toEqual(
      expect.objectContaining({
        ordenDespachoId: 50,
        clienteId: 22,
        secuencia: 1,
        destinatario: 'Carlos López',
        telefonoDestino: '5555',
        direccionDestino: 'Zona 1',
        latitudDestino: 15.67,
        longitudDestino: -91.71,
      }),
    );

    expect(payload.paradas[0].cargas[0]).toEqual({
      ordenDespachoDetalleId: 101,
      productoId: 12,
      cantidadPlanificada: 6,
    });
  });

  it('impide que VENDEDOR cree un envío', async () => {
    actors.findById.mockResolvedValue({
      ...actor,
      rol: 'VENDEDOR',
    });

    await expect(useCase.execute(command as any)).rejects.toMatchObject({
      code: 'TRANSPORT_FORBIDDEN',
    });

    expect(workflow.createShipment).not.toHaveBeenCalled();
  });

  it('impide operar con una bodega de otra empresa', async () => {
    bodegas.findById.mockResolvedValue({
      id: 3,
      empresaId: 2,
      activo: true,
    });

    await expect(useCase.execute(command as any)).rejects.toMatchObject({
      code: 'TRANSPORT_DISPATCH_NOT_ELIGIBLE',
    });
  });

  it('rechaza un despacho inexistente', async () => {
    dispatches.findTransportPlanningById.mockResolvedValue(null);

    await expect(useCase.execute(command as any)).rejects.toMatchObject({
      code: 'TRANSPORT_DISPATCH_NOT_FOUND',
    });
  });

  it('rechaza un despacho de otra bodega', async () => {
    dispatches.findTransportPlanningById.mockResolvedValue({
      ...dispatch,
      bodegaId: 99,
    });

    await expect(useCase.execute(command as any)).rejects.toMatchObject({
      code: 'TRANSPORT_DISPATCH_NOT_ELIGIBLE',
    });
  });

  it('rechaza un despacho que todavía no está preparado', async () => {
    dispatches.findTransportPlanningById.mockResolvedValue({
      ...dispatch,
      estado: 'PREPARANDO',
    });

    await expect(useCase.execute(command as any)).rejects.toMatchObject({
      code: 'TRANSPORT_DISPATCH_NOT_ELIGIBLE',
    });
  });

  it('rechaza una línea que no pertenece al despacho', async () => {
    await expect(
      useCase.execute({
        ...command,
        paradas: [
          {
            ordenDespachoId: 50,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: 999,
                cantidadPlanificada: 1,
              },
            ],
          },
        ],
      } as any),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_DISPATCH_NOT_ELIGIBLE',
    });
  });

  it('rechaza planificar más de lo preparado', async () => {
    await expect(
      useCase.execute({
        ...command,
        paradas: [
          {
            ordenDespachoId: 50,
            secuencia: 1,
            cargas: [
              {
                ordenDespachoDetalleId: 101,
                cantidadPlanificada: 11,
              },
            ],
          },
        ],
      } as any),
    ).rejects.toMatchObject({
      code: 'TRANSPORT_QUANTITY_EXCEEDED',
    });
  });
});
