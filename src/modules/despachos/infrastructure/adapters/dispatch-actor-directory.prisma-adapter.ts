import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AppRole } from 'src/shared/security/roles.decorator';
import { DispatchActorDirectoryPort } from '../../domain/ports/dispatch-actor-directory.port';

@Injectable()
export class DispatchActorDirectoryPrismaAdapter
  implements DispatchActorDirectoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const row = await this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        activo: true,
        empresaId: true,
      },
    });
    return row ? { ...row, rol: row.rol as AppRole } : null;
  }
}
