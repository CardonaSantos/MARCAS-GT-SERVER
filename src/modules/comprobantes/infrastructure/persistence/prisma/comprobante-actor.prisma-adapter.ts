import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ComprobanteActorPort } from '../../../application/ports/comprobante-actor.port';

@Injectable()
export class ComprobanteActorPrismaAdapter implements ComprobanteActorPort {
  constructor(private readonly prisma: PrismaService) {}
  async findActive(id: number) {
    const actor = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, activo: true, empresaId: true },
    });
    return actor?.activo && actor.empresaId ? { id: actor.id, empresaId: actor.empresaId } : null;
  }
}
