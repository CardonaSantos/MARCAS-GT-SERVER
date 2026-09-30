import { BodegaCodeConflictError } from '../../domain/errors/bodega.errors';
import {
  InMemoryBodegaRepository,
  InMemoryBodegaUserDirectory,
  StaticCompanyContext,
} from '../../testing/bodega.fakes';
import { CreateBodegaUseCase } from './create-bodega.use-case';

describe('CreateBodegaUseCase', () => {
  let repository: InMemoryBodegaRepository;
  let users: InMemoryBodegaUserDirectory;
  let useCase: CreateBodegaUseCase;

  beforeEach(() => {
    repository = new InMemoryBodegaRepository();
    users = new InMemoryBodegaUserDirectory();
    useCase = new CreateBodegaUseCase(
      repository,
      new StaticCompanyContext(1),
      users,
    );
  });

  it('establece automáticamente como principal la primera bodega', async () => {
    const created = await useCase.execute({
      codigo: 'central',
      nombre: 'Bodega Central',
      actorId: 1,
    });

    expect(created.esPrincipal).toBe(true);
    expect(created.empresaId).toBe(1);
  });

  it('rechaza códigos duplicados', async () => {
    await useCase.execute({
      codigo: 'central',
      nombre: 'Bodega Central',
      actorId: 1,
    });

    await expect(
      useCase.execute({
        codigo: 'CENTRAL',
        nombre: 'Otra',
        actorId: 1,
      }),
    ).rejects.toBeInstanceOf(BodegaCodeConflictError);
  });
});
