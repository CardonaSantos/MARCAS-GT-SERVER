import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TransportActorDirectoryPort } from '../../application/ports/transport-actor-directory.port';
import { TransportRole } from '../../transport.types';
@Injectable()
export class TransportActorDirectoryPrismaAdapter
  implements TransportActorDirectoryPort
{
  constructor(private readonly prisma: PrismaService) {}
  async findById(id: number) {
    const r = await this.prisma.usuario.findUnique({
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
    return r ? { ...r, rol: r.rol as TransportRole } : null;
  }
}
