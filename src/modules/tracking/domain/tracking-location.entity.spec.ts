import { TrackingLocationEntity } from './tracking-location.entity';

describe('TrackingLocationEntity', () => {
  const valid = {
    sesionId: 15,
    claveIdempotencia: 'gps-15-001',
    latitud: 15.6666667,
    longitud: -91.7111111,
    precisionM: 5.2,
    velocidadMps: 1.4,
    bateriaPct: 76,
    capturadoEn: '2026-10-05T15:45:20.000Z',
  };

  it('crea un punto GPS válido', () => {
    const point = TrackingLocationEntity.create(valid).toPrimitives();

    expect(point.sesionId).toBe(15);
    expect(point.claveIdempotencia).toBe('gps-15-001');
    expect(point.capturadoEn).toEqual(
      new Date('2026-10-05T15:45:20.000Z'),
    );
  });

  it.each([
    ['latitud', { ...valid, latitud: 91 }],
    ['longitud', { ...valid, longitud: -181 }],
    ['precision', { ...valid, precisionM: -1 }],
    ['velocidad', { ...valid, velocidadMps: -0.1 }],
    ['bateria', { ...valid, bateriaPct: 101 }],
  ])('rechaza %s fuera de rango', (_field, input) => {
    expect(() => TrackingLocationEntity.create(input)).toThrow();
  });

  it('rechaza una clave de idempotencia vacía', () => {
    expect(() =>
      TrackingLocationEntity.create({
        ...valid,
        claveIdempotencia: '   ',
      }),
    ).toThrow('claveIdempotencia no puede estar vacía.');
  });

  it('rechaza capturadoEn inválido', () => {
    expect(() =>
      TrackingLocationEntity.create({
        ...valid,
        capturadoEn: 'no-es-fecha',
      }),
    ).toThrow('capturadoEn debe contener una fecha válida.');
  });
});
