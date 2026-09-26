import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BODEGA_USER_DIRECTORY } from '../../../bodega.tokens';
import { BodegaUserRole } from '../../../domain/bodega.types';
import { BodegaUserDirectoryPort } from '../../../domain/ports/bodega-user-directory.port';
import { BODEGA_ROLES_METADATA } from './bodega-roles.decorator';

@Injectable()
export class BodegaRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(BODEGA_USER_DIRECTORY)
    private readonly users: BodegaUserDirectoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = Number(request.user?.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    const user = await this.users.findById(userId);
    if (!user || !user.activo) {
      throw new UnauthorizedException('El usuario no existe o está inactivo.');
    }

    const allowed = this.reflector.getAllAndOverride<BodegaUserRole[]>(
      BODEGA_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (allowed?.length && !allowed.includes(user.rol)) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta operación de bodegas.',
      );
    }

    return true;
  }
}
