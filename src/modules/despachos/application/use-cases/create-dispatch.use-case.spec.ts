import { BodegaDirectoryPort } from '../../../bodegas';
import { OrderDirectoryPort } from '../../../pedidos';
import { OrdenDespacho } from '../../domain/entities/dispatch-order.entity';
import { DispatchQuantityExceededError } from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { CreateDispatchUseCase } from './create-dispatch.use-case';

class RepositoryFake implements DispatchRepositoryPort {
  created: OrdenDespacho | null = null;
  programmed = new Map<number, number>();

  findById(): Promise<OrdenDespacho | null> {
    return Promise.resolve(null);
  }

  async create(entity: OrdenDespacho): Promise<OrdenDespacho> {
    this.created = entity;
    return entity;
  }

  async save(entity: OrdenDespacho): Promise<OrdenDespacho> {
    return entity;
  }

  hasOperations(): Promise<boolean> {
    return Promise.resolve(false);
  }

  activeProgrammedByOrderDetail(): Promise<Map<number, number>> {
    return Promise.resolve(this.programmed);
  }

  appendEvent(): Promise<void> {
    return Promise.resolve();
  }
}

const users: DispatchActorDirectoryPort = {
  findById: async () => ({
    id: 1,
    nombre: 'Admin',
    correo: 'admin@test.gt',
    rol: 'ADMIN',
    activo: true,
    empresaId: 9,
  }),
};

const orders: OrderDirectoryPort = {
  findById: async () => ({
    id: 5,
    numero: 'PED-000005',
    empresaId: 9,
    clienteId: 10,
    vendedorId: 11,
    estado: 'CONFIRMADO',
    condicionPago: 'CONTRAENTREGA',
    estadoPago: 'PENDIENTE',
    total: '100.00',
    confirmadoEn: new Date(),
    canceladoEn: null,
    detalles: [
      {
        id: 50,
        productoId: 500,
        cantidadSolicitada: 10,
        cantidadReservada: 0,
        cantidadDespachada: 0,
        cantidadEntregada: 0,
      },
    ],
  }),
};

const bodegas: BodegaDirectoryPort = {
  findById: async () => ({
    id: 3,
    empresaId: 9,
    codigo: 'CENTRAL',
    nombre: 'Bodega Central',
    activo: true,
    esPrincipal: true,
  }),
  findPrincipal: async () => null,
};

describe('CreateDispatchUseCase', () => {
  it('crea una planificación dentro de la capacidad pendiente', async () => {
    const repository = new RepositoryFake();
    const useCase = new CreateDispatchUseCase(
      repository,
      users,
      orders,
      bodegas,
    );

    const created = await useCase.execute({
      pedidoId: 5,
      bodegaId: 3,
      detalles: [
        { pedidoDetalleId: 50, cantidadProgramada: 6 },
      ],
      actorId: 1,
    });

    expect(created.detalles[0].cantidadProgramada).toBe(6);
    expect(repository.created).not.toBeNull();
  });

  it('considera cantidades ya planificadas por otros despachos', async () => {
    const repository = new RepositoryFake();
    repository.programmed.set(50, 7);

    const useCase = new CreateDispatchUseCase(
      repository,
      users,
      orders,
      bodegas,
    );

    await expect(
      useCase.execute({
        pedidoId: 5,
        bodegaId: 3,
        detalles: [
          { pedidoDetalleId: 50, cantidadProgramada: 4 },
        ],
        actorId: 1,
      }),
    ).rejects.toBeInstanceOf(DispatchQuantityExceededError);
  });
});
