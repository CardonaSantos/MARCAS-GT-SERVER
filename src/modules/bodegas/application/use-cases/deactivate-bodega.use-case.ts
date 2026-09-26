import {
  BodegaHasOperationalDependenciesError,
  BodegaNotFoundError,
} from '../../domain/errors/bodega.errors';
import { BodegaOperationalDependenciesPort } from '../../domain/ports/bodega-operational-dependencies.port';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';
import { hasBlockingBodegaDependencies } from '../../domain/bodega.types';
import { DeactivateBodegaCommand } from '../models/bodega.models';

export class DeactivateBodegaUseCase {
  constructor(
    private readonly repository: BodegaRepositoryPort,
    private readonly dependencies: BodegaOperationalDependenciesPort,
  ) {}

  async execute(command: DeactivateBodegaCommand) {
    const bodega = await this.repository.findById(command.id);
    if (!bodega) throw new BodegaNotFoundError(command.id);

    // Valida invariantes locales sin mutar todavía el agregado.
    bodega.assertCanDeactivate(command.motivo);

    const operational = await this.dependencies.inspect(command.id);
    if (hasBlockingBodegaDependencies(operational)) {
      throw new BodegaHasOperationalDependenciesError({ ...operational });
    }

    bodega.deactivate(command.motivo);

    return this.repository.update(bodega, [
      {
        actorId: command.actorId,
        type: 'DESACTIVADA',
        detail: command.motivo.trim(),
        metadata: { dependenciasVerificadas: true },
      },
    ]);
  }
}
