import {
  InventoryOperationsPort,
  InventoryReservationDirectoryPort,
} from '../../../inventario';
import { OrderDispatchGatePort } from '../../../pedidos';
import { OrdenDespacho } from '../../domain/entities/dispatch-order.entity';
import {
  DispatchInventoryOperationFailedError,
  DispatchOrderIntegrationFailedError,
} from '../../domain/errors/dispatch.errors';
import {
  DispatchOperationRepositoryPort,
  PreparedDispatchOperation,
} from '../../domain/ports/dispatch-operation.repository.port';
import { DispatchRepositoryPort } from '../../domain/ports/dispatch.repository.port';
import { DispatchOperationCoordinator } from './dispatch-operation.coordinator';

const actor = { id: 7, empresaId: 9 };

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
    tipo: 'RESERVA_PREPARACION',
    estado: 'PENDIENTE',
    estadoDespacho: 'PENDIENTE',
    claveIdempotencia: 'DSP:50:OP:100',
    observaciones: null,
    ocurridaEn: new Date('2026-10-01T10:00:00.000Z'),
    intentos: 1,
    version: 0,
    repeated: false,
    detalles: [
      {
        id: 1001,
        ordenDespachoDetalleId: 501,
        pedidoDetalleId: 201,
        productoId: 301,
        cantidad: 4,
        estado: 'PENDIENTE',
        reservaInventarioId: null,
        movimientoInventarioId: null,
        claveIdempotencia: 'DSP:50:OP:100:DET:501',
        errorAplicacion: null,
      },
    ],
    ...overrides,
  };
}

function dispatch(state: 'PENDIENTE' | 'PREPARANDO' | 'PREPARADA' | 'PARCIALMENTE_DESPACHADA' | 'DESPACHADA' | 'CANCELADA' = 'PENDIENTE') {
  return OrdenDespacho.rehydrate({
    id: 50,
    pedidoId: 20,
    bodegaId: 3,
    creadoPorId: 7,
    estado: state,
    version: 1,
    detalles: [
      {
        id: 501,
        pedidoDetalleId: 201,
        productoId: 301,
        cantidadProgramada: 4,
        cantidadPreparada:
          state === 'PENDIENTE' || state === 'PREPARANDO' ? 0 : 4,
        cantidadDespachada:
          state === 'PARCIALMENTE_DESPACHADA' ? 2 :
          state === 'DESPACHADA' ? 4 : 0,
        version: 0,
      },
    ],
  });
}

function setup(before = operation()) {
  const operations = {
    findById: jest.fn().mockResolvedValue(before),
    findByIdempotencyKey: jest.fn(),
    prepare: jest.fn(),
    beginAttempt: jest.fn().mockResolvedValue(before),
    recordInventoryResult: jest.fn().mockResolvedValue(undefined),
    markLineApplied: jest.fn().mockResolvedValue(undefined),
    commitDispatchLine: jest.fn().mockResolvedValue(undefined),
    markLineFailed: jest.fn().mockResolvedValue(undefined),
    markOperationApplied: jest.fn().mockResolvedValue(undefined),
    markOperationFailed: jest.fn().mockResolvedValue(undefined),
    netReservationsForDispatch: jest.fn().mockResolvedValue([]),
    hasPhysicalDispatchActivity: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<DispatchOperationRepositoryPort>;

  const dispatches = {
    findById: jest.fn().mockResolvedValue(dispatch('PENDIENTE')),
    create: jest.fn(),
    save: jest.fn().mockImplementation(async (entity) => entity),
    hasOperations: jest.fn(),
    activeProgrammedByOrderDetail: jest.fn(),
    appendEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DispatchRepositoryPort>;

  const inventory = {
    registerReceipt: jest.fn(),
    reserve: jest.fn().mockResolvedValue({
      movimientoId: 900,
      reservaId: 800,
      repeated: false,
    }),
    applyReservation: jest.fn().mockResolvedValue({
      movimientoId: 901,
      reservaId: 800,
      repeated: false,
    }),
    releaseReservation: jest.fn().mockResolvedValue({
      movimientoId: 902,
      reservaId: 800,
      repeated: false,
    }),
    cancelReservation: jest.fn(),
    registerReturn: jest.fn(),
    registerTransferOut: jest.fn(),
    registerTransferIn: jest.fn(),
  } as unknown as jest.Mocked<InventoryOperationsPort>;

  const reservations = {
    findByOrderDetailAndBodega: jest.fn().mockResolvedValue({
      id: 800,
      pedidoDetalleId: 201,
      stockBodegaId: 400,
      bodegaId: 3,
      productoId: 301,
      cantidadOriginal: 4,
      cantidadPendiente: 4,
      cantidadAplicada: 0,
      cantidadLiberada: 0,
      estado: 'ACTIVA',
      version: 0,
    }),
  } as unknown as jest.Mocked<InventoryReservationDirectoryPort>;

  const orders = {
    startPreparation: jest.fn().mockResolvedValue({
      repeated: false,
      pedidoId: 20,
      estado: 'EN_PREPARACION',
    }),
    registerDispatch: jest.fn().mockResolvedValue({
      repeated: false,
      pedidoId: 20,
      estado: 'PARCIALMENTE_DESPACHADO',
    }),
    releasePreparation: jest.fn().mockResolvedValue({
      repeated: false,
      pedidoId: 20,
      estado: 'CONFIRMADO',
    }),
  } as unknown as jest.Mocked<OrderDispatchGatePort>;

  const coordinator = new DispatchOperationCoordinator(
    operations,
    dispatches,
    inventory,
    reservations,
    orders,
  );

  return {
    coordinator,
    operations,
    dispatches,
    inventory,
    reservations,
    orders,
  };
}

describe('DispatchOperationCoordinator', () => {
  it('no repite efectos si la operación ya está aplicada', async () => {
    const fx = setup(
      operation({
        estado: 'APLICADA',
        repeated: true,
      }),
    );

    const result = await fx.coordinator.execute(100, actor);

    expect(result).toEqual({
      operationId: 100,
      dispatchId: 50,
      repeated: true,
      status: 'APLICADA',
    });
    expect(fx.operations.beginAttempt).not.toHaveBeenCalled();
    expect(fx.inventory.reserve).not.toHaveBeenCalled();
  });

  it('reserva inventario y mueve el despacho a PREPARANDO', async () => {
    const op = operation();
    const fx = setup(op);

    fx.operations.findById
      .mockResolvedValueOnce(op)
      .mockResolvedValueOnce(op);

    const pendingDispatch = dispatch('PENDIENTE');
    fx.dispatches.findById.mockResolvedValue(pendingDispatch);

    const result = await fx.coordinator.execute(100, actor);

    expect(fx.inventory.reserve).toHaveBeenCalledWith({
      pedidoDetalleId: 201,
      bodegaId: 3,
      cantidad: 4,
      claveIdempotencia: 'DSP:50:OP:100:DET:501',
      actorId: 7,
    });
    expect(fx.operations.recordInventoryResult).toHaveBeenCalledWith(
      1001,
      800,
      900,
    );
    expect(fx.operations.markLineApplied).toHaveBeenCalledWith(1001);
    expect(fx.orders.startPreparation).toHaveBeenCalled();
    expect(fx.dispatches.save).toHaveBeenCalled();
    expect(pendingDispatch.estado).toBe('PREPARANDO');
    expect(result.status).toBe('APLICADA');
  });

  it('marca línea y operación como fallidas si Inventario rechaza la reserva', async () => {
    const fx = setup();
    fx.inventory.reserve.mockRejectedValue(
      new Error('Stock insuficiente'),
    );

    await expect(
      fx.coordinator.execute(100, actor),
    ).rejects.toBeInstanceOf(
      DispatchInventoryOperationFailedError,
    );

    expect(fx.operations.markLineFailed).toHaveBeenCalledWith(
      1001,
      'Stock insuficiente',
    );
    expect(fx.operations.markOperationFailed).toHaveBeenCalled();
    expect(fx.dispatches.appendEvent).toHaveBeenCalledWith(
      50,
      expect.objectContaining({
        tipo: 'OPERACION_FALLIDA',
      }),
    );
    expect(fx.orders.startPreparation).not.toHaveBeenCalled();
  });

  it('procesa una salida física y sincroniza Pedido antes de confirmar la línea local', async () => {
    const op = operation({
      tipo: 'SALIDA_DESPACHO',
      estadoDespacho: 'PREPARADA',
      detalles: [
        {
          ...operation().detalles[0],
          cantidad: 2,
        },
      ],
    });
    const fx = setup(op);

    fx.operations.findById
      .mockResolvedValueOnce(op)
      .mockResolvedValueOnce(op);

    fx.dispatches.findById.mockResolvedValue(
      dispatch('PARCIALMENTE_DESPACHADA'),
    );

    await fx.coordinator.execute(100, actor);

    expect(
      fx.reservations.findByOrderDetailAndBodega,
    ).toHaveBeenCalledWith(201, 3);

    expect(fx.inventory.applyReservation).toHaveBeenCalledWith({
      reservaId: 800,
      cantidad: 2,
      reference: {
        type: 'OPERACION_DESPACHO_DETALLE',
        id: 1001,
      },
      observaciones: null,
      claveIdempotencia: 'DSP:50:OP:100:DET:501',
      actorId: 7,
    });

    expect(fx.operations.recordInventoryResult).toHaveBeenCalledWith(
      1001,
      800,
      901,
    );

    expect(fx.orders.registerDispatch).toHaveBeenCalledWith({
      pedidoId: 20,
      pedidoDetalleId: 201,
      cantidad: 2,
      movimientoInventarioId: 901,
      operacionDespachoDetalleId: 1001,
      actorId: 7,
      empresaId: 9,
    });

    expect(fx.operations.commitDispatchLine).toHaveBeenCalledWith(
      1001,
      7,
      op.ocurridaEn,
    );
    expect(fx.operations.markOperationApplied).toHaveBeenCalledWith(100);
  });

  it('conserva el movimiento de Inventario y deja retry posible si falla sincronización con Pedido', async () => {
    const op = operation({
      tipo: 'SALIDA_DESPACHO',
      estadoDespacho: 'PREPARADA',
    });
    const fx = setup(op);

    fx.orders.registerDispatch.mockRejectedValue(
      new Error('Pedido bloqueado'),
    );

    await expect(
      fx.coordinator.execute(100, actor),
    ).rejects.toBeInstanceOf(
      DispatchOrderIntegrationFailedError,
    );

    expect(fx.operations.recordInventoryResult).toHaveBeenCalledWith(
      1001,
      800,
      901,
    );
    expect(fx.operations.commitDispatchLine).not.toHaveBeenCalled();
    expect(fx.operations.markLineFailed).toHaveBeenCalledWith(
      1001,
      expect.stringContaining(
        'Inventario fue actualizado, pero no fue posible sincronizar el pedido',
      ),
    );
    expect(fx.operations.markOperationFailed).toHaveBeenCalled();
  });

  it('libera reservas y cancela el despacho después de reconciliar Pedido', async () => {
    const op = operation({
      tipo: 'LIBERACION_RESERVA',
      estadoDespacho: 'PREPARANDO',
    });
    const fx = setup(op);

    fx.operations.findById
      .mockResolvedValueOnce(op)
      .mockResolvedValueOnce(op);

    const preparing = OrdenDespacho.rehydrate({
      id: 50,
      pedidoId: 20,
      bodegaId: 3,
      estado: 'PREPARANDO',
      version: 2,
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
    fx.dispatches.findById.mockResolvedValue(preparing);

    await fx.coordinator.execute(100, actor);

    expect(fx.inventory.releaseReservation).toHaveBeenCalledWith({
      reservaId: 800,
      cantidad: 4,
      reference: {
        type: 'OPERACION_DESPACHO_DETALLE',
        id: 1001,
      },
      observaciones: null,
      claveIdempotencia: 'DSP:50:OP:100:DET:501',
      actorId: 7,
    });
    expect(fx.orders.releasePreparation).toHaveBeenCalled();
    expect(preparing.estado).toBe('CANCELADA');
    expect(fx.dispatches.save).toHaveBeenCalled();
  });

  it('registra auditoría de reintento antes de reprocesar una operación fallida', async () => {
    const before = operation({
      estado: 'FALLIDA',
      intentos: 1,
    });
    const attempt = operation({
      estado: 'APLICANDO',
      intentos: 2,
    });
    const fx = setup(before);

    fx.operations.beginAttempt.mockResolvedValue(attempt);
    fx.operations.findById
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(attempt);

    await fx.coordinator.execute(100, actor);

    expect(fx.dispatches.appendEvent).toHaveBeenCalledWith(
      50,
      expect.objectContaining({
        tipo: 'OPERACION_REINTENTADA',
        claveIdempotencia: 'DISPATCH_OP:100:RETRY:2',
      }),
    );
  });
});
