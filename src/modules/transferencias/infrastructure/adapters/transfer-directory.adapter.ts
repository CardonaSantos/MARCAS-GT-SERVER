import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { TransferDirectoryPort } from '../../application/ports/transfer-directory.port';

@Injectable()
export class TransferDirectoryAdapter implements TransferDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.transferenciaBodega.findUnique({
      where: { id },
      select: {
        id: true,
        estado: true,
        bodegaOrigenId: true,
        bodegaDestinoId: true,
        enviadaEn: true,
        recibidaEn: true,
      },
    });
  }
}
