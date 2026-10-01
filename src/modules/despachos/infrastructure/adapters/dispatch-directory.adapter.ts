import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import {
  DispatchDirectoryEntry,
  DispatchDirectoryPort,
} from '../../application/ports/dispatch-directory.port';
import { DispatchState } from '../../dispatch.types';

@Injectable()
export class DispatchDirectoryAdapter implements DispatchDirectoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<DispatchDirectoryEntry | null> {
    const row = await this.prisma.ordenDespacho.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        pedidoId: true,
        bodegaId: true,
        estado: true,
        programadoEn: true,
        preparadoEn: true,
        despachadoEn: true,
        pedido: { select: { empresaId: true } },
        detalles: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            pedidoDetalleId: true,
            productoId: true,
            cantidadProgramada: true,
            cantidadPreparada: true,
            cantidadDespachada: true,
          },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      numero: row.numero,
      pedidoId: row.pedidoId,
      empresaId: row.pedido.empresaId,
      bodegaId: row.bodegaId,
      estado: row.estado as DispatchState,
      programadoEn: row.programadoEn,
      preparadoEn: row.preparadoEn,
      despachadoEn: row.despachadoEn,
      detalles: row.detalles,
    };
  }
}
