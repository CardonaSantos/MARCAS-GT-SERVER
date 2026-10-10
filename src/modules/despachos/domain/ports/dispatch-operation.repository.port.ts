import {
  DispatchOperationState,
  DispatchOperationType,
  DispatchState,
} from '../../dispatch.types';

export type PrepareDispatchOperationCommand = Readonly<{
  ordenDespachoId: number;
  usuarioId: number;
  tipo: DispatchOperationType;
  claveIdempotencia: string;
  observaciones?: string | null;
  ocurridaEn?: Date | null;
  detalles: readonly {
    ordenDespachoDetalleId: number;
    cantidad: number;
  }[];
}>;

export type PreparedDispatchOperation = Readonly<{
  id: number;
  ordenDespachoId: number;
  pedidoId: number;
  empresaId: number;
  bodegaId: number;
  usuarioId: number;
  tipo: DispatchOperationType;
  estado: DispatchOperationState;
  estadoDespacho: DispatchState;
  claveIdempotencia: string;
  observaciones: string | null;
  ocurridaEn: Date;
  intentos: number;
  version: number;
  repeated: boolean;
  detalles: readonly {
    id: number;
    ordenDespachoDetalleId: number;
    pedidoDetalleId: number;
    productoId: number;
    cantidad: number;
    estado: 'PENDIENTE' | 'APLICADA' | 'FALLIDA';
    reservaInventarioId: number | null;
    movimientoInventarioId: number | null;
    claveIdempotencia: string;
    errorAplicacion: string | null;
  }[];
}>;

export type DispatchNetReservationLine = Readonly<{
  ordenDespachoDetalleId: number;
  pedidoDetalleId: number;
  productoId: number;
  cantidad: number;
}>;

export interface DispatchOperationRepositoryPort {
  prepare(command: PrepareDispatchOperationCommand): Promise<PreparedDispatchOperation>;
  findById(id: number): Promise<PreparedDispatchOperation | null>;
  findByIdempotencyKey(key: string): Promise<PreparedDispatchOperation | null>;
  findFailedOperation(
    dispatchId: number,
    type: DispatchOperationType,
  ): Promise<PreparedDispatchOperation | null>;
  beginAttempt(id: number): Promise<PreparedDispatchOperation>;
  recordInventoryResult(
    lineId: number,
    reservaInventarioId: number,
    movimientoInventarioId: number,
  ): Promise<void>;
  markLineApplied(lineId: number): Promise<void>;
  commitDispatchLine(lineId: number, actorId: number, occurredAt: Date): Promise<void>;
  markLineFailed(lineId: number, error: string): Promise<void>;
  markOperationApplied(id: number): Promise<void>;
  markOperationFailed(id: number, error: string): Promise<void>;
  netReservationsForDispatch(dispatchId: number): Promise<DispatchNetReservationLine[]>;
  hasPhysicalDispatchActivity(dispatchId: number): Promise<boolean>;
}
