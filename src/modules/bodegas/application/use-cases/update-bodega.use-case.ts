import {
  BodegaCodeConflictError,
  BodegaNoChangesError,
  BodegaNotFoundError,
} from '../../domain/errors/bodega.errors';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';
import { BodegaCode } from '../../domain/value-objects/bodega-code.vo';
import { UpdateBodegaCommand } from '../models/bodega.models';

export class UpdateBodegaUseCase {
  constructor(private readonly repository: BodegaRepositoryPort) {}

  async execute(command: UpdateBodegaCommand) {
    const bodega = await this.repository.findById(command.id);
    if (!bodega) throw new BodegaNotFoundError(command.id);

    const hasInput = [
      command.codigo,
      command.nombre,
      command.descripcion,
      command.direccion,
      command.telefono,
    ].some((value) => value !== undefined);

    if (!hasInput) throw new BodegaNoChangesError();

    if (command.codigo !== undefined) {
      const normalizedCode = BodegaCode.create(command.codigo).value;
      if (
        normalizedCode !== bodega.codigo &&
        (await this.repository.existsByCode(normalizedCode, command.id))
      ) {
        throw new BodegaCodeConflictError(normalizedCode);
      }
    }

    const before = bodega.snapshot();
    bodega.updateDetails({
      codigo: command.codigo,
      nombre: command.nombre,
      descripcion: command.descripcion,
      direccion: command.direccion,
      telefono: command.telefono,
    });

    const after = bodega.snapshot();
    const changed =
      before.codigo.value !== after.codigo.value ||
      before.nombre !== after.nombre ||
      before.descripcion !== after.descripcion ||
      before.direccion !== after.direccion ||
      before.telefono !== after.telefono;

    if (!changed) throw new BodegaNoChangesError();

    return this.repository.update(bodega, [
      {
        actorId: command.actorId,
        type: 'ACTUALIZADA',
        detail: 'Datos generales de la bodega actualizados.',
      },
    ]);
  }
}
