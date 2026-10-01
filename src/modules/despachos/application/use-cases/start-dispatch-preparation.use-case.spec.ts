import {
  InventoryAvailabilityPort,
} from '../../../inventario';
import { OrderDirectoryPort } from '../../../pedidos';
import { OrdenDespacho } from '../../domain/entities/dispatch-order.entity';
import {
  DispatchIdempotencyConflictError,
  DispatchInsufficientAvailabilityError,
} from '../../domain/errors/dispatch.errors';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';
import {
  DispatchOperationRepositoryPort,
  PreparedDispatchOperation,
} from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';
import { StartDispatchPreparationUseCase } from './start-dispatch-preparation.use-case';

const currentDispatch = OrdenDespacho.rehydrate({
  id: 50,
  pedidoId: 20,
  bodegaId: 3,
  estado: 'PENDIENTE',
  version: 0,
  detalles: [
    {
      id: 501,
      pedidoDetalleId: 201,
      productoId: 301,
      cantidadProgramada: 4,
      cantidadPreparada: 0,
      cantidadDespachada: 0,
      version: 0,
    },
  ],
});

function existingOperation(): PreparedDispatchOperation {
  return {
    id: 100,
    ordenDespachoId: 50,
    pedidoId: 20,
    empresaId: 9,
    bodegaId: 3,
    usuarioId: 7,
    tipo: 'RESERVA_PREPARACION',
    estado: 'FALLIDA',
    estadoDespacho: 'PENDIENTE',
    claveIdempotencia: 'DSP-PREP-0001',
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
        cantidad: 4,
        estado: 'FALLIDA',
        reservaInventarioId: null,
        movimientoInventarioId: null,
        claveIdempotencia: 'DSP-PREP-0001:DET:501',
        errorAplicacion: 'stock',
      },
    ],
  };
}

function setup() {
  const repository = {
    findById: jest.fn().mockResolvedValue(currentDispatch),
    create: jest.fn(),
    save: jest.fn(),
    hasOperations: jest.fn(),
    activeProgrammedByOrderDetail: jest.fn(),
    appendEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DispatchRepositoryPort>;

  const operations = {
    prepare: jest.fn().mockResolvedValue(existingOperation()),
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    beginAttempt: jest.fn(),
    recordInventoryResult: jest.fn(),
    markLineApplied: jest.fn(),
    commitDispatchLine: jest.fn(),
    markLineFailed: jest.fn(),
    markOperationApplied: jest.fn(),
    markOperationFailed: jest.fn().mockResolvedValue(undefined),
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
      estado: 'CONFIRMADO',
      condicionPago: 'CONTRAENTREGA',
      estadoPago: 'PENDIENTE',
      total: '100.00',
      confirmadoEn: new Date(),
      canceladoEn: null,
      detalles: [
        {
          id: 201,
          productoId: 301,
          cantidadSolicitada: 4,
          cantidadReservada: 0,
          cantidadDespachada: 0,
          cantidadEntregada: 0,
        },
      ],
    }),
  };

  const availability = {
    getProductAvailability: jest.fn(),
    hasAvailability: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<InventoryAvailabilityPort>;

  const coordinator = {
    execute: jest.fn().mockResolvedValue({
      operationId: 100,
      dispatchId: 50,
      repeated: false,
      status: 'APLICADA',
    }),
  } as unknown as jest.Mocked<DispatchOperationCoordinator>;

  const useCase = new StartDispatchPreparationUseCase(
    repository,
    operations,
    users,
    orders,
    availability,
    coordinator,
  );

  return {
    useCase,
    repository,
    operations,
    availability,
    coordinator,
  };
}

describe('StartDispatchPreparationUseCase', () => {
  it('crea la operación de reserva y ejecuta el coordinador', async () => {
    const fx = setup();

    await fx.useCase.execute({
      id: 50,
      claveIdempotencia: 'DSP-PREP-0001',
      actorId: 7,
    });

    expect(fx.availability.hasAvailability).toHaveBeenCalledWith(
      3,
      301,
      4,
    );

    expect(fx.operations.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        ordenDespachoId: 50,
        usuarioId: 7,
        tipo: 'RESERVA_PREPARACION',
        detalles: [
          {
            ordenDespachoDetalleId: 501,
            cantidad: 4,
          },
        ],
      }),
    );

    expect(fx.coordinator.execute).toHaveBeenCalled();
  });

  it('registra operación fallida si el pre-check detecta stock insuficiente', async () => {
    const fx = setup();
    fx.availability.hasAvailability.mockResolvedValue(false);

    await expect(
      fx.useCase.execute({
        id: 50,
        claveIdempotencia: 'DSP-PREP-0002',
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(
      DispatchInsufficientAvailabilityError,
    );

    expect(fx.operations.markOperationFailed).toHaveBeenCalledWith(
      100,
      expect.any(String),
    );
    expect(fx.repository.appendEvent).toHaveBeenCalledWith(
      50,
      expect.objectContaining({
        tipo: 'OPERACION_FALLIDA',
      }),
    );
    expect(fx.coordinator.execute).not.toHaveBeenCalled();
  });

  it('reutiliza una operación previa con la misma clave', async () => {
    const fx = setup();
    fx.operations.findByIdempotencyKey.mockResolvedValue(
      existingOperation(),
    );

    await fx.useCase.execute({
      id: 50,
      claveIdempotencia: 'DSP-PREP-0001',
      actorId: 7,
    });

    expect(fx.operations.prepare).not.toHaveBeenCalled();
    expect(fx.availability.hasAvailability).not.toHaveBeenCalled();
    expect(fx.coordinator.execute).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ id: 7 }),
    );
  });

  it('rechaza una clave utilizada por otro despacho/tipo de operación', async () => {
    const fx = setup();
    fx.operations.findByIdempotencyKey.mockResolvedValue({
      ...existingOperation(),
      ordenDespachoId: 999,
    });

    await expect(
      fx.useCase.execute({
        id: 50,
        claveIdempotencia: 'DSP-PREP-0001',
        actorId: 7,
      }),
    ).rejects.toBeInstanceOf(
      DispatchIdempotencyConflictError,
    );
  });
});
