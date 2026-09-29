import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AppRole } from 'src/shared/security/roles.decorator';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';

@Injectable()
export class OrderActorDirectoryPrismaAdapter implements OrderActorDirectoryPort {
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
    if (!row) return null;
    return { ...row, rol: row.rol as AppRole };
  }
}
