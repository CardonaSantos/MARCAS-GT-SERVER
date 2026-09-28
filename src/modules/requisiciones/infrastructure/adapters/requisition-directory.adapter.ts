import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RequisitionDirectoryPort } from '../../application/ports/requisition-directory.port';

@Injectable()
export class RequisitionDirectoryAdapter implements RequisitionDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.requisicion.findUnique({
      where: { id },
      select: {
        id: true,
        estado: true,
        bodegaDestinoId: true,
        proveedorId: true,
      },
    });
  }
}
