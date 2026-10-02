import { CreateDeliveryUseCase } from './create-delivery.use-case';

describe('CreateDeliveryUseCase', () => {
  it('crea la entrega desde la carga real de una parada en ruta', async () => {
    const repository: any = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findByStopId: jest.fn().mockResolvedValue(null),
      create: jest.fn(async (x) => ({ id: 50, estado: 'PENDIENTE', ...x })),
    };
    const actors: any = {
      findById: jest.fn().mockResolvedValue({
        id: 7, nombre: 'R', correo: 'r@x.gt', rol: 'REPARTIDOR', activo: true, empresaId: 1,
      }),
    };
    const transport: any = {
      findStopById: jest.fn().mockResolvedValue({
        empresaId: 1,
        envioId: 20,
        envioNumero: 'ENV-000020',
        envioEstado: 'EN_RUTA',
        modalidad: 'INTERNO',
        responsableId: 7,
        salidaEn: new Date(),
        entregaEstimadaEn: null,
        envioDespachoId: 100,
        paradaEstado: 'EN_RUTA',
        ordenDespachoId: 30,
        clienteId: 9,
        secuencia: 1,
        destino: { destinatario: 'Cliente', telefono: '1', direccion: 'X', latitud: 15, longitud: -91 },
        carga: [{ envioCargaDetalleId: 1, ordenDespachoDetalleId: 301, productoId: 4, cantidadCargada: 5 }],
      }),
    };
    const dispatches: any = {
      findById: jest.fn().mockResolvedValue({
        id: 30, pedidoId: 40, empresaId: 1, bodegaId: 1, estado: 'DESPACHADA',
        detalles: [{ id: 301, pedidoDetalleId: 401, productoId: 4, cantidadProgramada: 5, cantidadPreparada: 5, cantidadDespachada: 5 }],
      }),
    };

    const useCase = new CreateDeliveryUseCase(repository, actors, transport, dispatches);
    await useCase.execute({ envioDespachoId: 100, claveIdempotencia: 'DELIVERY-CREATE-100', actorId: 7 });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      pedidoId: 40,
      ordenDespachoId: 30,
      clienteId: 9,
      envioDespachoId: 100,
      detalles: [{
        ordenDespachoDetalleId: 301,
        pedidoDetalleId: 401,
        productoId: 4,
      }],
    }));
  });
});
