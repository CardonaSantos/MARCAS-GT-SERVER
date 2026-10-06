import { OrderDirectoryPort } from '../../../pedidos';
import { OrdenDespacho } from '../../domain/entities/dispatch-order.entity';
import {
  DispatchFailedOperationPendingRetryError,
  DispatchIdempotencyConflictError,
  DispatchInvalidStateError,
  DispatchQuantityExceededError,
  DispatchValidationError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import {
  DispatchOperationRepositoryPort,
  PreparedDispatchOperation,
} from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';
import { RegisterDispatchOutputUseCase } from './register-dispatch-output.use-case';

function dispatch(state: 'PREPARADA' | 'PARCIALMENTE_DESPACHADA' | 'PREPARANDO' = 'PREPARADA') {
  return OrdenDespacho.rehydrate({
    id: 50,
    pedidoId: 20,
    bodegaId: 3,
    estado: state,
    version: 2,
    detalles: [
      {
        id: 501,
        pedidoDetalleId: 201,
        productoId: 301,
        cantidadProgramada: 10,
        cantidadPreparada: 10,
        cantidadDespachada:
          state === 'PARCIALMENTE_DESPACHADA' ? 4 : 0,
        version: 1,
      },
    ],
  });
}

function existingOperation(
  overrides: Partial<PreparedDispatchOperation> = {},
): PreparedDispatchOperation {
  return {
    id: 100,
    ordenDespachoId: 50,
    pedidoId: 20,
    empresaId: 9,
    bodegaId: 3,
    usuarioId: 7,
    tipo: 'SALIDA_DESPACHO',
    estado: 'FALLIDA',
    estadoDespacho: 'PREPARADA',
    claveIdempotencia: 'DSP-OUT-0001',
    observaciones: null,
    ocurridaEn: new Date(),
    intentos: 1,
    version: 1,
    repeated: true,
    detalles: [
      {
        id: 1001,
        ordenDespachoDetalleId: 501,
        pedidoDetalleId: 201,
        productoId: 301,
        cantidad: 3,
        estado: 'FALLIDA',
        reservaInventarioId: 800,
        movimientoInventarioId: 900,
        claveIdempotencia: 'DSP-OUT-0001:DET:501',
        errorAplicacion: 'falló',
      },
    ],
    ...overrides,
  };
}

function setup(currentDispatch = dispatch()) {
  const repository = {
    findById: jest.fn().mockResolvedValue(currentDispatch),
    create: jest.fn(),
    save: jest.fn(),
    hasOperations: jest.fn(),
    activeProgrammedByOrderDetail: jest.fn(),
    appendEvent: jest.fn(),
  } as unknown as jest.Mocked<DispatchRepositoryPort>;

  const operations = {
    prepare: jest.fn().mockResolvedValue(existingOperation()),
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    findFailedOperation: jest.fn().mockResolvedValue(null),
    beginAttempt: jest.fn(),
    recordInventoryResult: jest.fn(),
    markLineApplied: jest.fn(),
    commitDispatchLine: jest.fn(),
    markLineFailed: jest.fn(),
    markOperationApplied: jest.fn(),
    markOperationFailed: jest.fn(),
    netReservationsForDispatch: jest.fn(),
    hasPhysicalDispatchActivity: jest.fn(),
  } as unknown as jest.Mocked<DispatchOperationRepositoryPort>;

  const users: DispatchActorDirectoryPort = {
    findById: async () => ({
      id: 7,
      nombre: 'Bodega',
      correo: 'bodega@test.gt',
      rol: 'BODEGA',
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
      detalles: [
        {
          id: 201,
          productoId: 301,
          cantidadSolicitada: 10,
          cantidadReservada: 10,
          cantidadDespachada: 0,
          cantidadEntregada: 0,
        },
      ],
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

  const useCase = new RegisterDispatchOutputUseCase(
    repository,
    operations,
    users,
    orders,
    coordinator,
  );

  return { useCase, repository, operations, coordinator };
}

describe('RegisterDispatchOutputUseCase', () => {
  it('crea una operación SALIDA_DESPACHO con la cantidad solicitada', async () => {
    const fx = setup();

    await fx.useCase.execute({
      id: 50,
      claveIdempotencia: 'DSP-OUT-0001',
      detalles: [{ detalleId: 501, cantidad: 3 }],
      actorId: 7,
    });

    expect(fx.operations.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        ordenDespachoId: 50,
        usuarioId: 7,
        tipo: 'SALIDA_DESPACHO',
        claveIdempotencia: 'DSP-OUT-0001',
        detalles: [
          {
            ordenDespachoDetalleId: 501,
            cantidad: 3,
          },
        ],
      }),
    );
    expect(fx.coordinator.execute).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ id: 7, empresaId: 9 }),
    );
  });

  it('rechaza salida superior a lo preparado pendiente', async () => {
    const fx = setup(dispatch('PARCIALMENTE_DESPACHADA'));

    await expect(
      fx.useCase.execute({
        id: 50,
        claveIdempotencia: 'DSP-OUT-0002',
        detalles: [{ detalleId: 501, cantidad: 7 }],
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(DispatchQuantityExceededError);

    expect(fx.operations.prepare).not.toHaveBeenCalled();
  });

  it('rechaza líneas duplicadas antes de persistir la operación', async () => {
    const fx = setup();

    await expect(
      fx.useCase.execute({
        id: 50,
        claveIdempotencia: 'DSP-OUT-0003',
        detalles: [
          { detalleId: 501, cantidad: 1 },
          { detalleId: 501, cantidad: 1 },
        ],
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(DispatchValidationError);

    expect(fx.operations.prepare).not.toHaveBeenCalled();
  });

  it('reutiliza una operación existente con la misma clave y payload', async () => {
    const fx = setup();
    fx.operations.findByIdempotencyKey.mockResolvedValue(
      existingOperation(),
    );

    await fx.useCase.execute({
      id: 50,
      claveIdempotencia: 'DSP-OUT-0001',
      detalles: [{ detalleId: 501, cantidad: 3 }],
      actorId: 7,
    });

    expect(fx.operations.prepare).not.toHaveBeenCalled();
    expect(fx.coordinator.execute).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ id: 7 }),
    );
  });

  it('rechaza reutilizar la misma clave con un payload distinto', async () => {
    const fx = setup();
    fx.operations.findByIdempotencyKey.mockResolvedValue(
      existingOperation(),
    );

    await expect(
      fx.useCase.execute({
        id: 50,
        claveIdempotencia: 'DSP-OUT-0001',
        detalles: [{ detalleId: 501, cantidad: 2 }],
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(DispatchIdempotencyConflictError);
  });

  it('bloquea una salida nueva si existe una salida fallida pendiente de reintento', async () => {
    const fx = setup();
    fx.operations.findFailedOperation.mockResolvedValue(
      existingOperation(),
    );

    await expect(
      fx.useCase.execute({
        id: 50,
        claveIdempotencia: 'DSP-OUT-NUEVA',
        detalles: [{ detalleId: 501, cantidad: 2 }],
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(
      DispatchFailedOperationPendingRetryError,
    );

    expect(fx.operations.findFailedOperation).toHaveBeenCalledWith(
      50,
      'SALIDA_DESPACHO',
    );
    expect(fx.operations.prepare).not.toHaveBeenCalled();
    expect(fx.coordinator.execute).not.toHaveBeenCalled();
  });

  it('rechaza una nueva salida si el despacho no está preparado', async () => {
    const fx = setup(dispatch('PREPARANDO'));

    await expect(
      fx.useCase.execute({
        id: 50,
        claveIdempotencia: 'DSP-OUT-0004',
        detalles: [{ detalleId: 501, cantidad: 1 }],
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(DispatchInvalidStateError);
  });
});
