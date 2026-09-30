import {
  TransferenciaBodega as PrismaTransfer,
  TransferenciaBodegaDetalle as PrismaTransferDetail,
} from '@prisma/client';
import { TransferenciaBodega } from '../../../domain/entities/transfer.entity';

type TransferRow = PrismaTransfer & {
  detalles: PrismaTransferDetail[];
};

export class TransferPrismaMapper {
  static toDomain(row: TransferRow): TransferenciaBodega {
    return TransferenciaBodega.rehydrate({
      id: row.id,
      bodegaOrigenId: row.bodegaOrigenId,
      bodegaDestinoId: row.bodegaDestinoId,
      creadoPorId: row.creadoPorId,
      estado: row.estado,
      observaciones: row.observaciones,
      motivoCancelacion: row.motivoCancelacion,
      preparadaEn: row.preparadaEn,
      enviadaEn: row.enviadaEn,
      recibidaEn: row.recibidaEn,
      canceladaEn: row.canceladaEn,
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
      detalles: row.detalles.map((detail) => ({
        id: detail.id,
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        cantidadEnviada: detail.cantidadEnviada,
        cantidadRecibida: detail.cantidadRecibida,
        observaciones: detail.observaciones,
        version: detail.version,
        creadoEn: detail.creadoEn,
        actualizadoEn: detail.actualizadoEn,
      })),
    });
  }
}
