import { OrderDirectoryPort } from '../../../pedidos';
import { OrdenDespacho } from '../../domain/entities/dispatch-order.entity';
import { DispatchInvalidStateError } from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import { DispatchOperationRepositoryPort } from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { CancelDispatchUseCase } from './cancel-dispatch.use-case';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';

function dispatch(
  state: 'PENDIENTE' | 'PREPARANDO' | 'PREPARADA' | 'CANCELADA' = 'PENDIENTE',
) {
  return OrdenDespacho.rehydrate({
    id: 50,
    pedidoId: 20,
    bodegaId: 3,
    estado: state,
    version: 2,
    canceladoEn:
      state === 'CANCELADA' ? new Date('2026-10-01T11:00:00Z') : null,
    canceladoPorId: state === 'CANCELADA' ? 7 : null,
    motivoCancelacion:
      state === 'CANCELADA' ? 'Cancelada previamente' : null,
    detalles: [
      {
        id: 501,
        pedidoDetalleId: 201,
        productoId: 301,
        cantidadProgramada: 4,
        cantidadPreparada:
          state === 'PREPARADA' ? 4 : 0,
        cantidadDespachada: 0,
        version: 0,
      },
    ],
  });
}

function setup(current = dispatch()) {
  const repository = {
    findById: jest.fn().mockResolvedValue(current),
    create: jest.fn(),
    save: jest.fn().mockImplementation(async (entity) => entity),
    hasOperations: jest.fn(),
    activeProgrammedByOrderDetail: jest.fn(),
    appendEvent: jest.fn(),
  } as unknown as jest.Mocked<DispatchRepositoryPort>;

  const operations = {
    prepare: jest.fn().mockResolvedValue({
      id: 100,
      ordenDespachoId: 50,
    }),
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    beginAttempt: jest.fn(),
    recordInventoryResult: jest.fn(),
    markLineApplied: jest.fn(),
    commitDispatchLine: jest.fn(),
    markLineFailed: jest.fn(),
    markOperationApplied: jest.fn(),
    markOperationFailed: jest.fn(),
    netReservationsForDispatch: jest.fn().mockResolvedValue([]),
    hasPhysicalDispatchActivity: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<DispatchOperationRepositoryPort>;

  const users: DispatchActorDirectoryPort = {
    findById: async () => ({
      id: 7,
      nombre: 'Admin',
      correo: 'admin@test.gt',
      rol: 'ADMIN',
      activo: true,
      empresaId: 9,
    }),
  };

  const orders: OrderDirectoryPort = {
    findById: async () => ({
      id: 20,
      numero: 'PED-000020',
      empresaId: 9,
      clienteId: 1,
      vendedorId: 2,
      estado: 'EN_PREPARACION',
      condicionPago: 'CONTRAENTREGA',
      estadoPago: 'PENDIENTE',
      total: '100.00',
      confirmadoEn: new Date(),
      canceladoEn: null,
      detalles: [],
    }),
  };

  const coordinator = {
    execute: jest.fn().mockResolvedValue({
      operationId: 100,
      dispatchId: 50,
      repeated: false,
      status: 'APLICADA',
    }),
  } as unknown as jest.Mocked<DispatchOperationCoordinator>;

  const useCase = new CancelDispatchUseCase(
    repository,
    operations,
    users,
    orders,
    coordinator,
  );

  return { useCase, repository, operations, coordinator, current };
}

describe('CancelDispatchUseCase', () => {
  it('cancela directamente una orden sin reservas activas', async () => {
    const fx = setup();

    const result = await fx.useCase.execute({
      id: 50,
      motivo: 'Pedido cancelado antes de preparar',
      claveIdempotencia: 'DSP-CANCEL-0001',
      actorId: 7,
    });

    expect(fx.operations.prepare).not.toHaveBeenCalled();
    expect(fx.repository.save).toHaveBeenCalled();
    expect(fx.current.estado).toBe('CANCELADA');
    expect(result.operationId).toBeNull();
    expect(result.status).toBe('APLICADA');
  });

  it('crea LIBERACION_RESERVA cuando existen unidades reservadas', async () => {
    const fx = setup(dispatch('PREPARANDO'));

    fx.operations.netReservationsForDispatch.mockResolvedValue([
      {
        ordenDespachoDetalleId: 501,
        pedidoDetalleId: 201,
        productoId: 301,
        cantidad: 4,
      },
    ]);

    await fx.useCase.execute({
      id: 50,
      motivo: 'Liberar preparación',
      claveIdempotencia: 'DSP-CANCEL-0002',
      actorId: 7,
    });

    expect(fx.operations.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        ordenDespachoId: 50,
        usuarioId: 7,
        tipo: 'LIBERACION_RESERVA',
        detalles: [
          {
            ordenDespachoDetalleId: 501,
            cantidad: 4,
          },
        ],
      }),
    );
    expect(fx.coordinator.execute).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ id: 7 }),
    );
  });

  it('impide cancelar si ya existe evidencia de salida física', async () => {
    const fx = setup(dispatch('PREPARADA'));
    fx.operations.hasPhysicalDispatchActivity.mockResolvedValue(true);

    await expect(
      fx.useCase.execute({
        id: 50,
        motivo: 'No debería permitirse',
        claveIdempotencia: 'DSP-CANCEL-0003',
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(DispatchInvalidStateError);

    expect(fx.operations.prepare).not.toHaveBeenCalled();
  });

  it('responde idempotentemente si la orden ya está cancelada', async () => {
    const fx = setup(dispatch('CANCELADA'));

    const result = await fx.useCase.execute({
      id: 50,
      motivo: 'Segundo intento',
      claveIdempotencia: 'DSP-CANCEL-0004',
      actorId: 7,
    });

    expect(result).toEqual({
      operationId: null,
      dispatchId: 50,
      repeated: true,
      status: 'APLICADA',
    });
    expect(fx.repository.save).not.toHaveBeenCalled();
    expect(fx.operations.prepare).not.toHaveBeenCalled();
  });
});
