import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InventoryUserRole } from '../../../domain/inventory.types';
import { InventoryUserDirectoryPort } from '../../../domain/ports/inventory-user-directory.port';
import { INVENTORY_USER_DIRECTORY } from '../../../inventory.tokens';
import { INVENTORY_ROLES_METADATA } from './inventory-roles.decorator';

@Injectable()
export class InventoryRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(INVENTORY_USER_DIRECTORY)
    private readonly users: InventoryUserDirectoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = Number(request.user?.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    const user = await this.users.findById(userId);
    if (!user || !user.activo) {
      throw new UnauthorizedException(
        'El usuario no existe o está inactivo.',
      );
    }

    const allowed = this.reflector.getAllAndOverride<InventoryUserRole[]>(
      INVENTORY_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (allowed?.length && !allowed.includes(user.rol)) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta operación de inventario.',
      );
    }

    return true;
  }
}
