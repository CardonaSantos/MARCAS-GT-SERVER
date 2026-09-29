import { CreateTransferUseCase } from './create-transfer.use-case';
import {
  FakeInventoryAvailability,
  FakeTransferActors,
  FakeTransferBodegas,
  FakeTransferRepository,
} from '../../testing/transfer.fakes';

describe('CreateTransferUseCase', () => {
  it('crea transferencia en borrador y audita', async () => {
    const repository = new FakeTransferRepository();
    const useCase = new CreateTransferUseCase(
      repository,
      new FakeTransferActors(),
      new FakeTransferBodegas(),
      new FakeInventoryAvailability(),
    );

    const result = await useCase.execute({
      bodegaOrigenId: 1,
      bodegaDestinoId: 2,
      actorId: 3,
      detalles: [
        {
          productoId: 10,
          cantidadSolicitada: 8,
        },
      ],
    });

    expect(result.id).toBe(1);
    expect(result.estado).toBe('BORRADOR');
    expect(result.detalles).toHaveLength(1);
    expect(repository.audits[0].type).toBe('CREADA');
  });
});
