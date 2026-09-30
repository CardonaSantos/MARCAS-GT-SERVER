import { InvalidBodegaResponsibleError } from '../../domain/errors/bodega.errors';
import { BodegaUserDirectoryPort } from '../../domain/ports/bodega-user-directory.port';
import { BodegaUserSnapshot } from '../../domain/bodega.types';

const RESPONSIBLE_ROLES = new Set(['ADMIN', 'BODEGA']);

export async function requireValidBodegaResponsible(
  directory: BodegaUserDirectoryPort,
  userId: number,
): Promise<BodegaUserSnapshot> {
  const user = await directory.findById(userId);

  if (!user) {
    throw new InvalidBodegaResponsibleError(
      userId,
      'El usuario seleccionado como responsable no existe.',
    );
  }

  if (!user.activo) {
    throw new InvalidBodegaResponsibleError(
      userId,
      'El usuario seleccionado como responsable está inactivo.',
    );
  }

  if (!RESPONSIBLE_ROLES.has(user.rol)) {
    throw new InvalidBodegaResponsibleError(
      userId,
      'El responsable de bodega debe tener rol ADMIN o BODEGA.',
    );
  }

  return user;
}
