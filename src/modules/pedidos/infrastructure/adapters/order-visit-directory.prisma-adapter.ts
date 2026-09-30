import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { OrderVisitDirectoryPort } from '../../domain/ports/order-visit-directory.port';

@Injectable()
export class OrderVisitDirectoryPrismaAdapter implements OrderVisitDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const row = await this.prisma.visita.findUnique({
      where: { id },
      select: {
        id: true,
        clienteId: true,
        usuarioId: true,
        estadoVisita: true,
        inicio: true,
        fin: true,
      },
    });
    if (!row) return null;
    return { ...row, estadoVisita: String(row.estadoVisita) };
  }
}
