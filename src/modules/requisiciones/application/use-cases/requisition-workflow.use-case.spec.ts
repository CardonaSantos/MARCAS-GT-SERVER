import { ApproveRequisitionUseCase } from './approve-requisition.use-case';
import { RequestRequisitionUseCase } from './request-requisition.use-case';
import { Requisition } from '../../domain/entities/requisition.entity';
import { FakeBodegaDirectory, FakeRequisitionActors, FakeRequisitionCatalog, FakeRequisitionRepository } from '../../testing/requisition.fakes';

describe('Requisition workflow use cases', () => {
  it('solicita y aprueba conservando auditoría', async () => {
    const repository = new FakeRequisitionRepository();
    repository.entity = Requisition.rehydrate({
      id: 7, empresaId: 1, bodegaDestinoId: 1, proveedorId: 2, solicitanteId: 3,
      estado: 'BORRADOR', version: 0,
      detalles: [{ id: 11, productoId: 10, cantidadSolicitada: 5, cantidadRecibida: 0 }],
    });
    await new RequestRequisitionUseCase(repository, new FakeRequisitionActors(), new FakeBodegaDirectory()).execute({ id: 7, actorId: 3 });
    await new ApproveRequisitionUseCase(repository, new FakeRequisitionActors(), new FakeBodegaDirectory(), new FakeRequisitionCatalog()).execute({ id: 7, actorId: 3 });
    expect(repository.entity?.estado).toBe('APROBADA');
    expect(repository.audits.map((a) => a.type)).toEqual(['SOLICITADA', 'APROBADA']);
  });
});
