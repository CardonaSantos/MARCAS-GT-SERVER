import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreditAuthorizationPort } from '../../application/ports/credit-authorization.port';

@Injectable()
export class CreditAuthorizationAdapter implements CreditAuthorizationPort {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderAuthorization(pedidoId: number) {
    const row = await this.prisma.solicitudCredito.findFirst({
      where: { pedidoId, estado: 'APROBADA', creditoId: { not: null } },
      orderBy: { resueltaEn: 'desc' },
      include: { credito: true, operacionPedido: true },
    });
    if (
      !row ||
      !row.credito ||
      row.credito.montoAutorizado == null ||
      row.credito.montoFinanciado == null ||
      row.credito.anticipoRequerido == null ||
      row.credito.plazoAutorizadoDias == null
    ) {
      return null;
    }
    return {
      pedidoId,
      solicitudId: row.id,
      creditoId: row.credito.id,
      approved: true,
      montoAutorizado: row.credito.montoAutorizado.toFixed(2),
      montoFinanciado: row.credito.montoFinanciado.toFixed(2),
      anticipoRequerido: row.credito.anticipoRequerido.toFixed(2),
      plazoAutorizadoDias: row.credito.plazoAutorizadoDias,
      integrationApplied: row.operacionPedido?.estado === 'APLICADA',
    };
  }
}
