import { Requisition } from '../../domain/entities/requisition.entity';
import {
  FakeBodegaDirectory,
  FakeInventoryOperations,
  FakeRequisitionActors,
  FakeRequisitionCatalog,
  FakeRequisitionRepository,
} from '../../testing/requisition.fakes';
import { RegisterRequisitionReceiptUseCase } from './register-requisition-receipt.use-case';

describe('RegisterRequisitionReceiptUseCase', () => {
  it('aplica cada línea por INVENTORY_OPERATIONS con clave determinista', async () => {
    const repository = new FakeRequisitionRepository();
    repository.entity = Requisition.rehydrate({
      id: 7,
      empresaId: 1,
      bodegaDestinoId: 1,
      proveedorId: 2,
      solicitanteId: 3,
      estado: 'APROBADA',
      version: 2,
      detalles: [
        { id: 11, productoId: 10, cantidadSolicitada: 10, cantidadRecibida: 0 },
      ],
    });
    const inventory = new FakeInventoryOperations();
    const useCase = new RegisterRequisitionReceiptUseCase(
      repository,
      new FakeRequisitionActors(),
      new FakeBodegaDirectory(),
      new FakeRequisitionCatalog(),
      inventory,
    );
    const result = await useCase.execute({
      requisicionId: 7,
      actorId: 3,
      claveIdempotencia: 'TEST:REQ:7:REC:1',
      detalles: [
        { requisicionDetalleId: 11, cantidad: 4, costoUnitario: '25.5000' },
      ],
    });
    expect(result.estado).toBe('APLICADA');
    expect(repository.receiptFinalized).toBe(true);
    expect(inventory.receipts).toHaveLength(1);
    expect(inventory.receipts[0].claveIdempotencia).toBe(
      'REQUISICION:7:RECEPCION:9:DETALLE:100',
    );
    expect(inventory.receipts[0].reference).toEqual({
      type: 'RECEPCION_REQUISICION',
      id: 100,
    });
  });

  it('devuelve repeated=true al reintentar una recepción que ya completó la requisición', async () => {
    const repository = new FakeRequisitionRepository();

    repository.entity = Requisition.rehydrate({
      id: 7,
      empresaId: 1,
      bodegaDestinoId: 1,
      proveedorId: 2,
      solicitanteId: 3,
      estado: 'COMPLETADA',
      version: 3,
      detalles: [
        {
          id: 11,
          productoId: 10,
          cantidadSolicitada: 10,
          cantidadRecibida: 10,
        },
      ],
    });

    repository.receipt = {
      id: 9,
      requisicionId: 7,
      bodegaDestinoId: 1,
      proveedorId: 2,
      recibidoPorId: 3,
      estado: 'APLICADA',
      claveIdempotencia: 'TEST:REQ:7:REC:1',
      repeated: true,
      detalles: [
        {
          id: 100,
          requisicionDetalleId: 11,
          productoId: 10,
          cantidad: 6,
          costoUnitario: '25.5000',
        },
      ],
    };

    const inventory = new FakeInventoryOperations();

    const useCase = new RegisterRequisitionReceiptUseCase(
      repository,
      new FakeRequisitionActors(),
      new FakeBodegaDirectory(),
      new FakeRequisitionCatalog(),
      inventory,
    );

    const result = await useCase.execute({
      requisicionId: 7,
      actorId: 3,
      claveIdempotencia: 'TEST:REQ:7:REC:1',
      detalles: [
        {
          requisicionDetalleId: 11,
          cantidad: 6,
          costoUnitario: '25.5000',
        },
      ],
    });

    expect(result).toEqual({
      repeated: true,
      receiptId: 9,
      requisicionId: 7,
      estado: 'APLICADA',
    });

    expect(inventory.receipts).toHaveLength(0);
    expect(repository.receiptFinalized).toBe(false);
  });
});
