import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/prisma.service';
import { APP_ROLES_METADATA, AppRole } from './roles.decorator';

@Injectable()
export class ActiveUserRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = Number(request.user?.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, rol: true, activo: true },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException(
        'El usuario no existe o está inactivo.',
      );
    }

    const allowed = this.reflector.getAllAndOverride<AppRole[]>(
      APP_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (allowed?.length && !allowed.includes(user.rol as AppRole)) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta operación.',
      );
    }

    return true;
  }
}
