import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ReceivableDirectoryPort } from '../../../application/ports/billing-query.port';

@Injectable()
export class ReceivableDirectoryPrismaAdapter implements ReceivableDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const row = await this.prisma.cuentaPorCobrar.findUnique({
      where: { id },
      select: {
        id: true,
        empresaId: true,
        clienteId: true,
        facturaId: true,
        estado: true,
        montoOriginal: true,
        saldoPendiente: true,
        fechaVencimiento: true,
        version: true,
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      empresaId: row.empresaId,
      clienteId: row.clienteId,
      facturaId: row.facturaId,
      estado: row.estado,
      montoOriginal: row.montoOriginal.toFixed(2),
      saldoPendiente: row.saldoPendiente.toFixed(2),
      fechaVencimiento: row.fechaVencimiento,
      version: row.version,
    };
  }
}
