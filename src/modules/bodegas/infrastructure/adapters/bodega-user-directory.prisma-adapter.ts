import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { BodegaUserSnapshot } from '../../domain/bodega.types';
import { BodegaUserDirectoryPort } from '../../domain/ports/bodega-user-directory.port';

@Injectable()
export class BodegaUserDirectoryPrismaAdapter
  implements BodegaUserDirectoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: number): Promise<BodegaUserSnapshot | null> {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        activo: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
      activo: user.activo,
    };
  }
}
