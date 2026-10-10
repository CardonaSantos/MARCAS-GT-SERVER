import { FinalizeDeliveryUseCase } from './finalize-delivery.use-case';

describe('FinalizeDeliveryUseCase', () => {
  it('sincroniza Pedido y Transporte antes de cerrar Entrega', async () => {
    const delivery: any = {
      id: 50, estado: 'EN_RUTA', pedidoId: 40, clienteId: 9, ordenDespachoId: 30,
      envioDespachoId: 100, version: 2, registradoPorId: 7,
      receptorNombre: 'Cliente', receptorDocumento: null, latitud: 15, longitud: -91,
      motivoNoEntrega: null, detalleNoEntrega: null,
      detalles: [{
        id: 501, ordenDespachoDetalleId: 301, pedidoDetalleId: 401, productoId: 4,
        cantidadEntregada: 5, cantidadRechazada: 0, motivoRechazo: null, version: 1,
      }],
      evidencias: [{ id: 1, tipo: 'FIRMA', url: 'x', key: null }],
    };
    const repository: any = {
      findById: jest.fn().mockResolvedValue(delivery),
      finalize: jest.fn().mockImplementation(async () => { delivery.estado = 'ENTREGADA'; }),
    };
    const actors: any = {
      findById: jest.fn().mockResolvedValue({ id: 7, nombre: 'R', correo: 'r@x.gt', rol: 'REPARTIDOR', activo: true, empresaId: 1 }),
    };
    const transport: any = {
      findStopById: jest.fn().mockResolvedValue({
        empresaId: 1, envioId: 20, envioNumero: 'ENV-20', envioEstado: 'EN_RUTA',
        modalidad: 'INTERNO', responsableId: 7, salidaEn: new Date(), entregaEstimadaEn: null,
        envioDespachoId: 100, paradaEstado: 'EN_RUTA', ordenDespachoId: 30, clienteId: 9, secuencia: 1,
        destino: { destinatario: 'Cliente', telefono: null, direccion: 'X', latitud: 15, longitud: -91 },
        carga: [{ envioCargaDetalleId: 1, ordenDespachoDetalleId: 301, productoId: 4, cantidadCargada: 5 }],
      }),
    };
    const dispatches: any = {
      findById: jest.fn().mockResolvedValue({ id: 30, pedidoId: 40, empresaId: 1, bodegaId: 1, estado: 'DESPACHADA', detalles: [] }),
    };
    const orders: any = { registerDelivery: jest.fn().mockResolvedValue({ repeated: false, pedidoId: 40, estado: 'ENTREGADO' }) };
    const transportGate: any = { markStopResult: jest.fn().mockResolvedValue(undefined) };

    const useCase = new FinalizeDeliveryUseCase(repository, actors, transport, dispatches, orders, transportGate);
    await useCase.execute({
      id: 50, resultado: 'ENTREGADA', receptorNombre: 'Cliente', latitud: 15, longitud: -91,
      claveIdempotencia: 'DELIVERY-FINAL-50', actorId: 7,
    });

    expect(orders.registerDelivery).toHaveBeenCalledTimes(1);
    expect(transportGate.markStopResult).toHaveBeenCalledWith(expect.objectContaining({
      envioDespachoId: 100,
      resultado: 'ENTREGADA',
      claveIdempotencia: 'DELIVERY-FINAL-50:TRANSPORT',
    }));
    expect(repository.finalize).toHaveBeenCalledTimes(1);
  });

  it('tolera que los gates externos reporten reintento idempotente', async () => {
    const delivery: any = {
      id: 50, estado: 'EN_RUTA', pedidoId: 40, clienteId: 9, ordenDespachoId: 30,
      envioDespachoId: 100, version: 2, registradoPorId: 7,
      receptorNombre: 'Cliente', receptorDocumento: null, latitud: 15, longitud: -91,
      motivoNoEntrega: null, detalleNoEntrega: null,
      detalles: [{ id: 501, ordenDespachoDetalleId: 301, pedidoDetalleId: 401, productoId: 4, cantidadEntregada: 5, cantidadRechazada: 0, motivoRechazo: null, version: 1 }],
      evidencias: [{ id: 1, tipo: 'FIRMA', url: 'x', key: null }],
    };
    const repository: any = {
      findById: jest.fn()
        .mockResolvedValueOnce(delivery)
        .mockResolvedValueOnce(delivery)
        .mockResolvedValueOnce({ ...delivery, estado: 'ENTREGADA', version: 3 }),
      finalize: jest.fn(),
    };
    const actors: any = { findById: jest.fn().mockResolvedValue({ id: 7, nombre: 'R', correo: 'r@x.gt', rol: 'REPARTIDOR', activo: true, empresaId: 1 }) };
    const transport: any = { findStopById: jest.fn().mockResolvedValue({
      empresaId: 1, envioId: 20, envioNumero: 'ENV-20', envioEstado: 'ENTREGADO_PARCIAL', modalidad: 'INTERNO',
      responsableId: 7, salidaEn: new Date(), entregaEstimadaEn: null, envioDespachoId: 100, paradaEstado: 'ATENDIDA',
      ordenDespachoId: 30, clienteId: 9, secuencia: 1,
      destino: { destinatario: 'Cliente', telefono: null, direccion: 'X', latitud: 15, longitud: -91 },
      carga: [{ envioCargaDetalleId: 1, ordenDespachoDetalleId: 301, productoId: 4, cantidadCargada: 5 }],
    }) };
    const dispatches: any = { findById: jest.fn().mockResolvedValue({ id: 30, pedidoId: 40, empresaId: 1, detalles: [] }) };
    const orders: any = { registerDelivery: jest.fn().mockResolvedValue({ repeated: true, pedidoId: 40, estado: 'ENTREGADO' }) };
    const transportGate: any = { markStopResult: jest.fn().mockResolvedValue(undefined) };

    const useCase = new FinalizeDeliveryUseCase(repository, actors, transport, dispatches, orders, transportGate);
    await useCase.execute({ id: 50, resultado: 'ENTREGADA', receptorNombre: 'Cliente', latitud: 15, longitud: -91, claveIdempotencia: 'DELIVERY-FINAL-50', actorId: 7 });

    expect(orders.registerDelivery).toHaveBeenCalledTimes(1);
    expect(transportGate.markStopResult).toHaveBeenCalledTimes(1);
  });
});
