import { TransferenciaBodega } from './transfer.entity';

describe('TransferenciaBodega', () => {
  it('crea un borrador y lo prepara', () => {
    const transfer = TransferenciaBodega.create({
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      creadoPorId: 3,
      detalles: [
        {
          productoId: 10,
          cantidadSolicitada: 5,
        },
      ],
    });

    expect(transfer.estado).toBe('BORRADOR');
    expect(transfer.version).toBe(0);

    transfer.prepare();

    expect(transfer.estado).toBe('PREPARADA');
    expect(transfer.version).toBe(1);
    expect(transfer.preparadaEn).toBeInstanceOf(Date);
  });

  it('rechaza origen y destino iguales', () => {
    expect(() =>
      TransferenciaBodega.create({
        bodegaOrigenId: 1,
        bodegaDestinoId: 1,
        creadoPorId: 3,
      }),
    ).toThrow('La bodega origen y la bodega destino deben ser diferentes.');
  });

  it('no permite cancelar mercancía que ya está en tránsito', () => {
    const transfer = TransferenciaBodega.rehydrate({
      id: 1,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      creadoPorId: 3,
      estado: 'EN_TRANSITO',
      version: 2,
      detalles: [
        {
          id: 1,
          productoId: 10,
          cantidadSolicitada: 5,
          cantidadEnviada: 5,
          cantidadRecibida: 0,
          version: 1,
        },
      ],
    });

    expect(() => transfer.cancel('Ya no la quiero')).toThrow(
      'La transferencia no se encuentra en un estado válido para esta operación.',
    );
  });
});
