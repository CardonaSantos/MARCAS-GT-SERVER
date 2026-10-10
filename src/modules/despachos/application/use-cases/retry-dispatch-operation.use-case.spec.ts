import {
  DispatchOperationNotFoundError,
  DispatchOperationNotRetryableError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import {
  DispatchOperationRepositoryPort,
  PreparedDispatchOperation,
} from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';
import { RetryDispatchOperationUseCase } from './retry-dispatch-operation.use-case';

function operation(
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
    estadoDespacho: 'PARCIALMENTE_DESPACHADA',
    claveIdempotencia: 'DSP-OUT-0001',
    observaciones: null,
    ocurridaEn: new Date(),
    intentos: 1,
    version: 1,
    repeated: false,
    detalles: [
      {
        id: 1001,
        ordenDespachoDetalleId: 501,
        pedidoDetalleId: 201,
        productoId: 301,
        cantidad: 2,
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

function setup(current: PreparedDispatchOperation | null = operation()) {
  const operations = {
    findById: jest.fn().mockResolvedValue(current),
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

  const coordinator = {
    execute: jest.fn().mockResolvedValue({
      operationId: 100,
      dispatchId: 50,
      repeated: false,
      status: 'APLICADA',
    }),
  } as unknown as jest.Mocked<DispatchOperationCoordinator>;

  return {
    useCase: new RetryDispatchOperationUseCase(
      operations,
      users,
      coordinator,
    ),
    coordinator,
  };
}

describe('RetryDispatchOperationUseCase', () => {
  it('reintenta una salida fallida todavía compatible con el estado del despacho', async () => {
    const fx = setup();

    await fx.useCase.execute(100, 7);

    expect(fx.coordinator.execute).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ id: 7, empresaId: 9 }),
    );
  });

  it('rechaza reintentar una operación ya aplicada', async () => {
    const fx = setup(
      operation({ estado: 'APLICADA' }),
    );

    await expect(
      fx.useCase.execute(100, 7),
    ).rejects.toBeInstanceOf(
      DispatchOperationNotRetryableError,
    );

    expect(fx.coordinator.execute).not.toHaveBeenCalled();
  });

  it('rechaza una reserva fallida si el despacho ya fue cancelado', async () => {
    const fx = setup(
      operation({
        tipo: 'RESERVA_PREPARACION',
        estadoDespacho: 'CANCELADA',
      }),
    );

    await expect(
      fx.useCase.execute(100, 7),
    ).rejects.toBeInstanceOf(
      DispatchOperationNotRetryableError,
    );
  });

  it('informa operación inexistente', async () => {
    const fx = setup(null);

    await expect(
      fx.useCase.execute(999, 7),
    ).rejects.toBeInstanceOf(
      DispatchOperationNotFoundError,
    );
  });
});
