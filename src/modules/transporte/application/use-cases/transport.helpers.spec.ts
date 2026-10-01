import {
  assertPlanner,
  assertRouteOperator,
  requireTransportActor,
  transportReadScope,
} from './transport.helpers';

describe('transport.helpers', () => {
  it('requiere actor activo y con empresa', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue({
        id: 1,
        nombre: 'Admin',
        correo: 'a@test.local',
        rol: 'ADMIN',
        activo: true,
        empresaId: 5,
      }),
    } as any;

    await expect(requireTransportActor(users, 1)).resolves.toMatchObject({
      id: 1,
      empresaId: 5,
    });
  });

  it('rechaza actor inactivo', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue({
        id: 1,
        rol: 'ADMIN',
        activo: false,
        empresaId: 5,
      }),
    } as any;

    await expect(requireTransportActor(users, 1)).rejects.toMatchObject({
      code: 'TRANSPORT_ACTOR_NOT_FOUND',
    });
  });

  it('assertPlanner acepta ADMIN y BODEGA', () => {
    expect(() => assertPlanner({ rol: 'ADMIN' })).not.toThrow();
    expect(() => assertPlanner({ rol: 'BODEGA' })).not.toThrow();
  });

  it('assertPlanner rechaza VENDEDOR/REPARTIDOR', () => {
    expect(() => assertPlanner({ rol: 'VENDEDOR' })).toThrow();
    expect(() => assertPlanner({ rol: 'REPARTIDOR' })).toThrow();
  });

  it('assertRouteOperator permite al repartidor responsable', () => {
    expect(() =>
      assertRouteOperator({ id: 9, rol: 'REPARTIDOR' }, 9),
    ).not.toThrow();
  });

  it('transportReadScope restringe VENDEDOR a sus pedidos', () => {
    expect(
      transportReadScope({ id: 8, rol: 'VENDEDOR', empresaId: 5 }),
    ).toEqual({
      empresaId: 5,
      rol: 'VENDEDOR',
      vendedorId: 8,
    });
  });

  it('transportReadScope restringe REPARTIDOR a sus envíos', () => {
    expect(
      transportReadScope({ id: 9, rol: 'REPARTIDOR', empresaId: 5 }),
    ).toEqual({
      empresaId: 5,
      rol: 'REPARTIDOR',
      responsableId: 9,
    });
  });
});
