import { BodegaNotFoundError } from '../../domain/errors/bodega.errors';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';
import { ActivateBodegaCommand } from '../models/bodega.models';

export class ActivateBodegaUseCase {
  constructor(private readonly repository: BodegaRepositoryPort) {}

  async execute(command: ActivateBodegaCommand) {
    const bodega = await this.repository.findById(command.id);
    if (!bodega) throw new BodegaNotFoundError(command.id);

    bodega.activate();

    return this.repository.update(bodega, [
      {
        actorId: command.actorId,
        type: 'ACTIVADA',
        detail: 'Bodega reactivada.',
      },
    ]);
  }
}
