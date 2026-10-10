import { TransportDeliveryGateAdapter } from './transport-delivery-gate.adapter';

describe('TransportDeliveryGateAdapter', () => {
  function setup(options?: {
    siblings?: Array<{ estado: string }>;
    modalidad?: 'INTERNO' | 'EXTERNO';
  }) {
    const tx = {
      envioDespacho: {
        findUnique: jest.fn().mockResolvedValue({
          id: 11,
          envioId: 7,
          estado: 'EN_RUTA',
          envio: {
            id: 7,
            modalidad: options?.modalidad ?? 'INTERNO',
            vehiculoId: 21,
            conductorId: 31,
          },
        }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(options?.siblings ?? []),
      },
      envio: {
        update: jest.fn().mockResolvedValue({}),
      },
      vehiculo: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      conductor: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      envioEvento: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      envioEvento: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<void>) =>
        work(tx),
      ),
    };

    return {
      adapter: new TransportDeliveryGateAdapter(prisma as any),
      prisma,
      tx,
    };
  }

  it.each(['RECHAZADA', 'NO_ENTREGADA'] as const)(
    'cierra la última parada y libera recursos cuando el resultado es %s',
    async (resultado) => {
      const { adapter, tx } = setup();

      await adapter.markStopResult({
        envioDespachoId: 11,
        actorId: 5,
        resultado,
        detalle: 'Intento finalizado.',
        claveIdempotencia: `DELIVERY-RESULT-${resultado}`,
      });

      expect(tx.envioDespacho.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: {
          estado: 'ATENDIDA',
          version: { increment: 1 },
        },
      });
      expect(tx.envio.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({
          estado: 'COMPLETADO',
          completadoPorId: 5,
          version: { increment: 1 },
        }),
      });
      expect(tx.vehiculo.updateMany).toHaveBeenCalledWith({
        where: { id: 21, estado: 'EN_RUTA' },
        data: { estado: 'DISPONIBLE', version: { increment: 1 } },
      });
      expect(tx.conductor.updateMany).toHaveBeenCalledWith({
        where: { id: 31, estado: 'EN_RUTA' },
        data: { estado: 'DISPONIBLE', version: { increment: 1 } },
      });
      expect(tx.envioEvento.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          envioId: 7,
          usuarioId: 5,
          tipo: 'COMPLETADO',
          estado: 'COMPLETADO',
          metadata: { envioDespachoId: 11, resultado },
        }),
      });
    },
  );

  it('marca una parada terminal como atendida y mantiene la ruta parcial si quedan paradas', async () => {
    const { adapter, tx } = setup({
      siblings: [{ estado: 'EN_RUTA' }],
    });

    await adapter.markStopResult({
      envioDespachoId: 11,
      actorId: 5,
      resultado: 'NO_ENTREGADA',
      detalle: 'Cliente ausente.',
      claveIdempotencia: 'DELIVERY-PARTIAL-ROUTE',
    });

    expect(tx.envioDespacho.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        estado: 'ATENDIDA',
        version: { increment: 1 },
      },
    });
    expect(tx.envio.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        estado: 'ENTREGADO_PARCIAL',
        version: { increment: 1 },
      },
    });
    expect(tx.vehiculo.updateMany).not.toHaveBeenCalled();
    expect(tx.conductor.updateMany).not.toHaveBeenCalled();
    expect(tx.envioEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'PARADA_ATENDIDA',
        estado: 'ENTREGADO_PARCIAL',
        metadata: {
          envioDespachoId: 11,
          resultado: 'NO_ENTREGADA',
        },
      }),
    });
  });
});
