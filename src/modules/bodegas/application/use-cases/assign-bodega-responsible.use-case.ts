import {
  BodegaNoChangesError,
  BodegaNotFoundError,
} from '../../domain/errors/bodega.errors';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';
import { BodegaUserDirectoryPort } from '../../domain/ports/bodega-user-directory.port';
import { AssignBodegaResponsibleCommand } from '../models/bodega.models';
import { requireValidBodegaResponsible } from './bodega-use-case.helpers';

export class AssignBodegaResponsibleUseCase {
  constructor(
    private readonly repository: BodegaRepositoryPort,
    private readonly userDirectory: BodegaUserDirectoryPort,
  ) {}

  async execute(command: AssignBodegaResponsibleCommand) {
    const bodega = await this.repository.findById(command.id);
    if (!bodega) throw new BodegaNotFoundError(command.id);

    if (command.responsableId === null) {
      if (bodega.responsableId == null) throw new BodegaNoChangesError();
      const previous = bodega.responsableId;
      bodega.removeResponsible();

      return this.repository.update(bodega, [
        {
          actorId: command.actorId,
          type: 'RESPONSABLE_REMOVIDO',
          detail: 'Responsable removido de la bodega.',
          metadata: { responsableAnteriorId: previous },
        },
      ]);
    }

    const user = await requireValidBodegaResponsible(
      this.userDirectory,
      command.responsableId,
    );

    if (bodega.responsableId === user.id) throw new BodegaNoChangesError();

    const previous = bodega.responsableId ?? null;
    bodega.assignResponsible(user.id);

    return this.repository.update(bodega, [
      {
        actorId: command.actorId,
        type: 'RESPONSABLE_ASIGNADO',
        detail: `Responsable asignado: ${user.nombre}.`,
        metadata: {
          responsableAnteriorId: previous,
          responsableId: user.id,
        },
      },
    ]);
  }
}
