import { TransferenciaBodega } from '../../domain/entities/transfer.entity';
import {
  FakeTransferActors,
  FakeTransferOperationsRepository,
  FakeTransferRepository,
} from '../../testing/transfer.fakes';
import { CancelTransferUseCase } from './cancel-transfer.use-case';

describe('CancelTransferUseCase', () => {
  it('bloquea cancelación si existe una operación física no resuelta', async () => {
    const repository = new FakeTransferRepository();
    repository.entity = TransferenciaBodega.rehydrate({
      id: 1,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      creadoPorId: 3,
      estado: 'PREPARADA',
      version: 1,
      detalles: [
        {
          id: 10,
          productoId: 100,
          cantidadSolicitada: 5,
          cantidadEnviada: 0,
          cantidadRecibida: 0,
          version: 0,
        },
      ],
    });

    const operations = new FakeTransferOperationsRepository();
    operations.unresolvedOperations = true;

    const useCase = new CancelTransferUseCase(
      repository,
      operations,
      new FakeTransferActors(),
    );

    await expect(
      useCase.execute({
        id: 1,
        actorId: 3,
        motivo: 'Cancelación operativa',
      }),
    ).rejects.toMatchObject({
      code: 'TRANSFER_OPERATION_CONFLICT',
    });
  });
});
