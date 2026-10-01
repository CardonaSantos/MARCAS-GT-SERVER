import { Shipment } from './shipment.entity';

describe('Shipment entity', () => {
  const base = {
    empresaId: 1,
    bodegaId: 2,
    modalidad: 'INTERNO' as const,
    paradas: [
      {
        ordenDespachoId: 10,
        clienteId: 20,
        secuencia: 1,
        destinatario: 'Cliente Demo',
        telefonoDestino: '5555-5555',
        direccionDestino: 'Jacaltenango, Huehuetenango',
        latitudDestino: 15.666,
        longitudDestino: -91.711,
        cargas: [
          {
            ordenDespachoDetalleId: 100,
            productoId: 200,
            cantidadPlanificada: 5,
            cantidadCargada: 0,
          },
        ],
      },
    ],
  };

  it('crea un envío nuevo en PROGRAMADO con version 0', () => {
    const shipment = Shipment.create(base);

    expect(shipment.estado).toBe('PROGRAMADO');
    expect(shipment.version).toBe(0);
    expect(shipment.empresaId).toBe(1);
    expect(shipment.bodegaId).toBe(2);
    expect(shipment.paradas).toHaveLength(1);
  });

  it('rehidrata un envío persistido sin cambiar su estado/version', () => {
    const shipment = Shipment.rehydrate({
      ...base,
      id: 99,
      numero: 'ENV-000099',
      estado: 'CARGADO',
      version: 4,
    });

    expect(shipment.id).toBe(99);
    expect(shipment.numero).toBe('ENV-000099');
    expect(shipment.estado).toBe('CARGADO');
    expect(shipment.version).toBe(4);
  });

  it('rechaza un envío sin paradas', () => {
    expect(() =>
      Shipment.create({
        ...base,
        paradas: [],
      }),
    ).toThrow('El envío debe contener al menos una parada.');
  });

  it('rechaza una parada sin líneas de carga', () => {
    expect(() =>
      Shipment.create({
        ...base,
        paradas: [{ ...base.paradas[0], cargas: [] }],
      }),
    ).toThrow('Cada parada debe contener al menos una línea de carga.');
  });

  it('rechaza cantidades planificadas no positivas', () => {
    expect(() =>
      Shipment.create({
        ...base,
        paradas: [
          {
            ...base.paradas[0],
            cargas: [
              {
                ...base.paradas[0].cargas[0],
                cantidadPlanificada: 0,
              },
            ],
          },
        ],
      }),
    ).toThrow('Las cantidades de carga son inconsistentes.');
  });

  it('rechaza cantidad cargada mayor que planificada', () => {
    expect(() =>
      Shipment.create({
        ...base,
        paradas: [
          {
            ...base.paradas[0],
            cargas: [
              {
                ...base.paradas[0].cargas[0],
                cantidadPlanificada: 5,
                cantidadCargada: 6,
              },
            ],
          },
        ],
      }),
    ).toThrow('Las cantidades de carga son inconsistentes.');
  });

  it('rechaza el mismo despacho dos veces dentro del mismo envío', () => {
    expect(() =>
      Shipment.create({
        ...base,
        paradas: [
          base.paradas[0],
          {
            ...base.paradas[0],
            secuencia: 2,
          },
        ],
      }),
    ).toThrow('No se puede repetir un despacho en el mismo envío.');
  });

  it('rechaza dos paradas con la misma secuencia', () => {
    expect(() =>
      Shipment.create({
        ...base,
        paradas: [
          base.paradas[0],
          {
            ...base.paradas[0],
            ordenDespachoId: 11,
          },
        ],
      }),
    ).toThrow('No se puede repetir la secuencia de una parada.');
  });

  it('permite asignación únicamente desde PROGRAMADO', () => {
    expect(() => Shipment.create(base).assertAssignable()).not.toThrow();

    const assigned = Shipment.rehydrate({
      ...base,
      estado: 'ASIGNADO',
      version: 1,
    });

    expect(() => assigned.assertAssignable()).toThrow();
  });

  it('permite confirmar carga únicamente desde ASIGNADO', () => {
    const assigned = Shipment.rehydrate({
      ...base,
      estado: 'ASIGNADO',
      version: 1,
    });
    expect(() => assigned.assertLoadConfirmable()).not.toThrow();

    const scheduled = Shipment.create(base);
    expect(() => scheduled.assertLoadConfirmable()).toThrow();
  });

  it('permite iniciar ruta únicamente desde CARGADO', () => {
    const loaded = Shipment.rehydrate({
      ...base,
      estado: 'CARGADO',
      version: 2,
    });
    expect(() => loaded.assertRouteStartable()).not.toThrow();

    const assigned = Shipment.rehydrate({
      ...base,
      estado: 'ASIGNADO',
      version: 1,
    });
    expect(() => assigned.assertRouteStartable()).toThrow();
  });

  it('solo permite cancelación administrativa en PROGRAMADO o ASIGNADO', () => {
    expect(() => Shipment.create(base).assertCancelable()).not.toThrow();

    const assigned = Shipment.rehydrate({
      ...base,
      estado: 'ASIGNADO',
      version: 1,
    });
    expect(() => assigned.assertCancelable()).not.toThrow();

    const loaded = Shipment.rehydrate({
      ...base,
      estado: 'CARGADO',
      version: 2,
    });
    expect(() => loaded.assertCancelable()).toThrow();
  });
});
