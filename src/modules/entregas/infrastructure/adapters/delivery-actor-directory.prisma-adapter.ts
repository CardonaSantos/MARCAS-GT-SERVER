import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { DeliveryActorDirectoryPort } from '../../application/ports/delivery-actor-directory.port';

@Injectable()
export class DeliveryActorDirectoryPrismaAdapter implements DeliveryActorDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async findById(id: number) {
    const user = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, correo: true, rol: true, activo: true, empresaId: true },
    });
    return user as any;
  }
}
