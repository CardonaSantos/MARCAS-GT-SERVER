import {
  FakeTransferActors,
  FakeTransferBodegas,
  FakeTransferInventoryOperations,
  FakeTransferOperationsRepository,
} from '../../testing/transfer.fakes';
import { SendTransferUseCase } from './send-transfer.use-case';

describe('SendTransferUseCase', () => {
  it('registra salida completa y conserva costo histórico', async () => {
    const operations = new FakeTransferOperationsRepository();
    operations.prepared = {
      id: 20,
      transferenciaId: 7,
      usuarioId: 3,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      estadoTransferencia: 'PREPARADA',
      tipo: 'SALIDA',
      estado: 'PENDIENTE',
      claveIdempotencia: 'TRANSFER-7-SALIDA-1',
      documentoReferencia: null,
      observaciones: null,
      ocurridaEn: new Date(),
      repeated: false,
      detalles: [
        {
          id: 100,
          transferenciaDetalleId: 11,
          productoId: 10,
          cantidad: 5,
          costoUnitario: null,
        },
      ],
    };

    const inventory = new FakeTransferInventoryOperations();
    const useCase = new SendTransferUseCase(
      operations,
      new FakeTransferActors(),
      new FakeTransferBodegas(),
      inventory,
    );

    const result = await useCase.execute({
      transferenciaId: 7,
      actorId: 3,
      claveIdempotencia: 'TRANSFER-7-SALIDA-1',
    });

    expect(inventory.outbound).toHaveLength(1);
    expect(inventory.outbound[0].claveIdempotencia).toBe(
      'TRANSFERENCIA:OPERACION:20:DETALLE:100',
    );
    expect(operations.lineResults).toEqual([
      {
        operacionDetalleId: 100,
        costoUnitario: '26.2500',
      },
    ]);
    expect(result.estadoTransferencia).toBe('EN_TRANSITO');
  });

  it('repite una salida aplicada sin volver a tocar inventario', async () => {
    const operations = new FakeTransferOperationsRepository();
    operations.prepared = {
      id: 20,
      transferenciaId: 7,
      usuarioId: 3,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      estadoTransferencia: 'RECIBIDA_PARCIAL',
      tipo: 'SALIDA',
      estado: 'APLICADA',
      claveIdempotencia: 'TRANSFER-7-SALIDA-1',
      documentoReferencia: null,
      observaciones: null,
      ocurridaEn: new Date(),
      repeated: true,
      detalles: [
        {
          id: 100,
          transferenciaDetalleId: 11,
          productoId: 10,
          cantidad: 5,
          costoUnitario: '26.2500',
        },
      ],
    };

    const inventory = new FakeTransferInventoryOperations();
    const useCase = new SendTransferUseCase(
      operations,
      new FakeTransferActors(),
      new FakeTransferBodegas(),
      inventory,
    );

    const result = await useCase.execute({
      transferenciaId: 7,
      actorId: 3,
      claveIdempotencia: 'TRANSFER-7-SALIDA-1',
    });

    expect(result.repeated).toBe(true);
    expect(result.estadoTransferencia).toBe('RECIBIDA_PARCIAL');
    expect(inventory.outbound).toHaveLength(0);
  });
});
