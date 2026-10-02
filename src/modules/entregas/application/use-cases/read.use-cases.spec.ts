import { GetDeliveryUseCase } from './read.use-cases';

describe('GetDeliveryUseCase', () => {
  const actor = {
    id: 7,
    nombre: 'Repartidor',
    correo: 'rep@test.local',
    rol: 'REPARTIDOR',
    activo: true,
    empresaId: 1,
  };

  it('marca tracking como stale cuando todavía no existe capturadoEn', async () => {
    const query: any = {
      get: jest.fn().mockResolvedValue({
        id: 50,
        transporte: {
          responsable: { id: actor.id },
        },
      }),
    };
    const actors: any = {
      findById: jest.fn().mockResolvedValue(actor),
    };
    const tracking: any = {
      getCurrent: jest.fn().mockResolvedValue({
        usuarioId: actor.id,
        sesionId: null,
        sesionActiva: false,
        ultimoHeartbeatEn: null,
        latitud: null,
        longitud: null,
        precisionM: null,
        velocidadMps: null,
        bateriaPct: null,
        capturadoEn: null,
      }),
    };

    const useCase = new GetDeliveryUseCase(query, actors, tracking);
    const result = await useCase.execute(50, actor.id);

    expect(result.trackingActual).toEqual(
      expect.objectContaining({
        usuarioId: actor.id,
        capturadoEn: null,
        stale: true,
      }),
    );
  });

  it('marca tracking reciente como no stale', async () => {
    const capturedAt = new Date();

    const query: any = {
      get: jest.fn().mockResolvedValue({
        id: 50,
        transporte: {
          responsable: { id: actor.id },
        },
      }),
    };
    const actors: any = {
      findById: jest.fn().mockResolvedValue(actor),
    };
    const tracking: any = {
      getCurrent: jest.fn().mockResolvedValue({
        usuarioId: actor.id,
        sesionId: 9,
        sesionActiva: true,
        ultimoHeartbeatEn: capturedAt,
        latitud: 15.67,
        longitud: -91.71,
        precisionM: 5,
        velocidadMps: null,
        bateriaPct: 80,
        capturadoEn: capturedAt,
      }),
    };

    const useCase = new GetDeliveryUseCase(query, actors, tracking);
    const result = await useCase.execute(50, actor.id);

    expect(result.trackingActual.stale).toBe(false);
  });
});
