import { CreateRequisitionUseCase } from './create-requisition.use-case';
import { FakeBodegaDirectory, FakeRequisitionActors, FakeRequisitionCatalog, FakeRequisitionRepository } from '../../testing/requisition.fakes';

describe('CreateRequisitionUseCase', () => {
  it('crea un borrador con empresa derivada del actor', async () => {
    const repository = new FakeRequisitionRepository();
    const useCase = new CreateRequisitionUseCase(repository, new FakeRequisitionActors(), new FakeBodegaDirectory(), new FakeRequisitionCatalog());
    const result = await useCase.execute({
      bodegaDestinoId: 1, proveedorId: 2, actorId: 3,
      detalles: [{ productoId: 10, cantidadSolicitada: 5, costoUnitarioEstimado: '25.0000' }],
    });
    expect(result.id).toBe(1);
    expect(result.empresaId).toBe(1);
    expect(result.estado).toBe('BORRADOR');
    expect(repository.audits[0].type).toBe('CREADA');
  });
});
