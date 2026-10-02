import { Delivery } from './delivery.entity';

const base = () =>
  Delivery.restore({
    estado: 'EN_RUTA',
    version: 0,
    detalles: [],
  });

describe('Delivery', () => {
  it('acepta una entrega completa consistente', () => {
    expect(() =>
      base().validateFinalization({
        resultado: 'ENTREGADA',
        receptorNombre: 'Cliente',
        latitud: 15,
        longitud: -91,
        modalidad: 'INTERNO',
        evidencias: [{ tipo: 'FIRMA' }],
        lineas: [{
          ordenDespachoDetalleId: 1,
          pedidoDetalleId: 1,
          productoId: 1,
          cantidadCargada: 4,
          cantidadEntregada: 4,
          cantidadRechazada: 0,
        }],
      }),
    ).not.toThrow();
  });

  it('bloquea una entrega que excede la carga', () => {
    expect(() =>
      base().validateLineResult({
        cantidadCargada: 2,
        cantidadEntregada: 3,
        cantidadRechazada: 0,
      }),
    ).toThrow();
  });

  it('exige motivo para NO_ENTREGADA', () => {
    expect(() =>
      base().validateFinalization({
        resultado: 'NO_ENTREGADA',
        latitud: 15,
        longitud: -91,
        modalidad: 'INTERNO',
        evidencias: [],
        lineas: [{
          ordenDespachoDetalleId: 1,
          pedidoDetalleId: 1,
          productoId: 1,
          cantidadCargada: 4,
          cantidadEntregada: 0,
          cantidadRechazada: 0,
        }],
      }),
    ).toThrow();
  });
});
