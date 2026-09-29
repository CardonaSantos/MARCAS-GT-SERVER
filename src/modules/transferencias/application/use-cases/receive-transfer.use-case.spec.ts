import {
  FakeTransferActors,
  FakeTransferBodegas,
  FakeTransferInventoryOperations,
  FakeTransferOperationsRepository,
} from '../../testing/transfer.fakes';
import { ReceiveTransferUseCase } from './receive-transfer.use-case';

describe('ReceiveTransferUseCase', () => {
  it('registra recepción usando el costo histórico de salida', async () => {
    const operations = new FakeTransferOperationsRepository();
    operations.prepared = {
      id: 21,
      transferenciaId: 7,
      usuarioId: 3,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      estadoTransferencia: 'EN_TRANSITO',
      tipo: 'RECEPCION',
      estado: 'PENDIENTE',
      claveIdempotencia: 'TRANSFER-7-REC-1',
      documentoReferencia: null,
      observaciones: null,
      ocurridaEn: new Date(),
      repeated: false,
      detalles: [
        {
          id: 101,
          transferenciaDetalleId: 11,
          productoId: 10,
          cantidad: 2,
          costoUnitario: '26.2500',
        },
      ],
    };

    const inventory = new FakeTransferInventoryOperations();
    const useCase = new ReceiveTransferUseCase(
      operations,
      new FakeTransferActors(),
      new FakeTransferBodegas(),
      inventory,
    );

    const result = await useCase.execute({
      transferenciaId: 7,
      actorId: 3,
      claveIdempotencia: 'TRANSFER-7-REC-1',
      detalles: [
        {
          transferenciaDetalleId: 11,
          cantidad: 2,
        },
      ],
    });

    expect(inventory.inbound).toHaveLength(1);
    expect(inventory.inbound[0].costoUnitario).toBe('26.2500');
    expect(inventory.inbound[0].claveIdempotencia).toBe(
      'TRANSFERENCIA:OPERACION:21:DETALLE:101',
    );
    expect(result.estadoTransferencia).toBe('RECIBIDA_PARCIAL');
  });

  it('repite recepción aplicada aunque la transferencia ya esté RECIBIDA', async () => {
    const operations = new FakeTransferOperationsRepository();
    operations.prepared = {
      id: 22,
      transferenciaId: 7,
      usuarioId: 3,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      estadoTransferencia: 'RECIBIDA',
      tipo: 'RECEPCION',
      estado: 'APLICADA',
      claveIdempotencia: 'TRANSFER-7-REC-FINAL',
      documentoReferencia: null,
      observaciones: null,
      ocurridaEn: new Date(),
      repeated: true,
      detalles: [
        {
          id: 102,
          transferenciaDetalleId: 11,
          productoId: 10,
          cantidad: 3,
          costoUnitario: '26.2500',
        },
      ],
    };

    const inventory = new FakeTransferInventoryOperations();
    const useCase = new ReceiveTransferUseCase(
      operations,
      new FakeTransferActors(),
      new FakeTransferBodegas(),
      inventory,
    );

    const result = await useCase.execute({
      transferenciaId: 7,
      actorId: 3,
      claveIdempotencia: 'TRANSFER-7-REC-FINAL',
      detalles: [
        {
          transferenciaDetalleId: 11,
          cantidad: 3,
        },
      ],
    });

    expect(result.repeated).toBe(true);
    expect(result.estadoTransferencia).toBe('RECIBIDA');
    expect(inventory.inbound).toHaveLength(0);
  });
});
