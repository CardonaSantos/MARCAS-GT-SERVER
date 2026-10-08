import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

/** El catálogo completo incluye costos; se limita a ADMIN y se revalida contra BD. */
@Injectable()
export class ProductCatalogAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = Number(request.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Usuario no autenticado.');
    }

    const actor = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, rol: true, activo: true, empresaId: true },
    });

    if (!actor || !actor.activo) {
      throw new UnauthorizedException('Usuario inexistente o inactivo.');
    }
    if (actor.rol !== 'ADMIN') {
      throw new ForbiddenException('Solo ADMIN puede consultar el catálogo completo.');
    }
    if (!actor.empresaId) {
      throw new ForbiddenException('El administrador no tiene empresa asignada.');
    }

    // No confiar en empresaId o rol enviados por query/JWT.
    request.catalogEmpresaId = actor.empresaId;
    return true;
  }
}
