import { Prisma } from '@prisma/client';
import { OrdenDespacho } from '../../../domain/entities/dispatch-order.entity';
import { DispatchState } from '../../../dispatch.types';

export const DISPATCH_WITH_DETAILS = {
  detalles: { orderBy: { id: 'asc' as const } },
} satisfies Prisma.OrdenDespachoInclude;

export type DispatchPersistenceRow = Prisma.OrdenDespachoGetPayload<{
  include: typeof DISPATCH_WITH_DETAILS;
}>;

export class DispatchPrismaMapper {
  static toDomain(row: DispatchPersistenceRow): OrdenDespacho {
    return OrdenDespacho.rehydrate({
      id: row.id,
      pedidoId: row.pedidoId,
      bodegaId: row.bodegaId,
      creadoPorId: row.creadoPorId,
      preparadoPorId: row.preparadoPorId,
      despachadoPorId: row.despachadoPorId,
      canceladoPorId: row.canceladoPorId,
      numero: row.numero,
      estado: row.estado as DispatchState,
      programadoEn: row.programadoEn,
      preparacionIniciadaEn: row.preparacionIniciadaEn,
      preparadoEn: row.preparadoEn,
      despachadoEn: row.despachadoEn,
      canceladoEn: row.canceladoEn,
      motivoCancelacion: row.motivoCancelacion,
      observaciones: row.observaciones,
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
      detalles: row.detalles.map((detail) => ({
        id: detail.id,
        pedidoDetalleId: detail.pedidoDetalleId,
        productoId: detail.productoId,
        cantidadProgramada: detail.cantidadProgramada,
        cantidadPreparada: detail.cantidadPreparada,
        cantidadDespachada: detail.cantidadDespachada,
        observaciones: detail.observaciones,
        version: detail.version,
        creadoEn: detail.creadoEn,
        actualizadoEn: detail.actualizadoEn,
      })),
    });
  }
}
