import {
  BodegaNotFoundError,
} from '../../domain/errors/bodega.errors';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';
import { SetPrincipalBodegaCommand } from '../models/bodega.models';

export class SetPrincipalBodegaUseCase {
  constructor(private readonly repository: BodegaRepositoryPort) {}

  async execute(command: SetPrincipalBodegaCommand) {
    const bodega = await this.repository.findById(command.id);
    if (!bodega) throw new BodegaNotFoundError(command.id);

    // Valida inactiva / ya principal dentro de la entidad.
    bodega.markAsPrincipal();

    return this.repository.setPrincipal(command.id, {
      actorId: command.actorId,
      type: 'ESTABLECIDA_PRINCIPAL',
      detail: 'Bodega establecida como principal.',
    });
  }
}
