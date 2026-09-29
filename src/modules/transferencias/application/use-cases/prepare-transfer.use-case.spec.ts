import { TransferenciaBodega } from '../../domain/entities/transfer.entity';
import {
  FakeInventoryAvailability,
  FakeTransferActors,
  FakeTransferBodegas,
  FakeTransferRepository,
} from '../../testing/transfer.fakes';
import { PrepareTransferUseCase } from './prepare-transfer.use-case';

describe('PrepareTransferUseCase', () => {
  it('valida disponibilidad y prepara', async () => {
    const repository = new FakeTransferRepository();
    repository.entity = TransferenciaBodega.rehydrate({
      id: 1,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      creadoPorId: 3,
      estado: 'BORRADOR',
      version: 0,
      detalles: [
        {
          id: 11,
          productoId: 10,
          cantidadSolicitada: 5,
          cantidadEnviada: 0,
          cantidadRecibida: 0,
          version: 0,
        },
      ],
    });

    const useCase = new PrepareTransferUseCase(
      repository,
      new FakeTransferActors(),
      new FakeTransferBodegas(),
      new FakeInventoryAvailability(),
    );

    const result = await useCase.execute({ id: 1, actorId: 3 });

    expect(result.estado).toBe('PREPARADA');
    expect(repository.audits[repository.audits.length - 1]?.type).toBe('PREPARADA');
  });

  it('rechaza preparación sin disponibilidad', async () => {
    const repository = new FakeTransferRepository();
    repository.entity = TransferenciaBodega.rehydrate({
      id: 1,
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      creadoPorId: 3,
      estado: 'BORRADOR',
      version: 0,
      detalles: [
        {
          id: 11,
          productoId: 10,
          cantidadSolicitada: 5,
          cantidadEnviada: 0,
          cantidadRecibida: 0,
          version: 0,
        },
      ],
    });

    const availability = new FakeInventoryAvailability();
    availability.available = false;

    const useCase = new PrepareTransferUseCase(
      repository,
      new FakeTransferActors(),
      new FakeTransferBodegas(),
      availability,
    );

    await expect(
      useCase.execute({ id: 1, actorId: 3 }),
    ).rejects.toMatchObject({
      code: 'TRANSFER_INSUFFICIENT_AVAILABILITY',
    });
  });
});
