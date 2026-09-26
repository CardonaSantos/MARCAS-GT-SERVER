import { Bodega } from '../../domain/entities/bodega.entity';
import { BodegaHasOperationalDependenciesError } from '../../domain/errors/bodega.errors';
import {
  InMemoryBodegaRepository,
  StaticOperationalDependencies,
} from '../../testing/bodega.fakes';
import { DeactivateBodegaUseCase } from './deactivate-bodega.use-case';

describe('DeactivateBodegaUseCase', () => {
  it('bloquea la inactivación cuando existe stock real', async () => {
    const repository = new InMemoryBodegaRepository();
    const dependencies = new StaticOperationalDependencies();
    dependencies.value = { ...dependencies.value, stockReal: 10 };

    const bodega = await repository.create(
      Bodega.create({
        empresaId: 1,
        codigo: 'SEC-01',
        nombre: 'Secundaria',
      }),
      [],
    );

    const useCase = new DeactivateBodegaUseCase(repository, dependencies);

    await expect(
      useCase.execute({
        id: bodega.id!,
        motivo: 'Cierre temporal',
        actorId: 1,
      }),
    ).rejects.toBeInstanceOf(BodegaHasOperationalDependenciesError);

    expect((await repository.findById(bodega.id!))?.activo).toBe(true);
  });
});
