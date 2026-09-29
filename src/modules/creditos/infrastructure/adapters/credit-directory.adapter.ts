import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreditDirectoryPort } from '../../application/ports/credit-directory.port';
import { CreditApplicationState } from '../../credit.types';

@Injectable()
export class CreditDirectoryAdapter implements CreditDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(pedidoId: number) {
    const row = await this.prisma.solicitudCredito.findFirst({
      where: { pedidoId },
      orderBy: { solicitadaEn: 'desc' },
      include: {
        decision: true,
        credito: true,
        operacionPedido: true,
      },
    });
    if (!row) return null;
    return {
      solicitudId: row.id,
      numero: row.numero,
      pedidoId: row.pedidoId,
      clienteId: row.clienteId,
      estado: row.estado as CreditApplicationState,
      creditoId: row.creditoId,
      montoSolicitado: row.montoSolicitado.toFixed(2),
      montoAutorizado: row.decision?.montoAutorizado?.toFixed(2) ?? null,
      montoFinanciado: row.credito?.montoFinanciado?.toFixed(2) ?? null,
      anticipoRequerido: row.decision?.anticipoRequerido?.toFixed(2) ?? null,
      plazoAutorizadoDias: row.decision?.plazoAutorizadoDias ?? null,
      integracionEstado: row.operacionPedido?.estado ?? null,
    };
  }
}
