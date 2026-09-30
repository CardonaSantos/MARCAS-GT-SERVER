import {
  Requisicion as PrismaRequisicion,
  RequisicionDetalle,
} from '@prisma/client';
import { Requisition } from '../../../domain/entities/requisition.entity';

type RequisitionRow = PrismaRequisicion & { detalles: RequisicionDetalle[] };

export class RequisitionPrismaMapper {
  static toDomain(row: RequisitionRow): Requisition {
    return Requisition.rehydrate({
      id: row.id,
      empresaId: row.empresaId,
      bodegaDestinoId: row.bodegaDestinoId,
      proveedorId: row.proveedorId,
      solicitanteId: row.solicitanteId,
      estado: row.estado,
      observaciones: row.observaciones,
      solicitadaEn: row.solicitadaEn,
      aprobadaEn: row.aprobadaEn,
      rechazadaEn: row.rechazadaEn,
      canceladaEn: row.canceladaEn,
      completadaEn: row.completadaEn,
      motivoRechazo: row.motivoRechazo,
      motivoCancelacion: row.motivoCancelacion,
      version: row.version,
      creadoEn: row.creadoEn,
      actualizadoEn: row.actualizadoEn,
      detalles: row.detalles.map((detail) => ({
        id: detail.id,
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        cantidadRecibida: detail.cantidadRecibida,
        costoUnitarioEstimado: detail.costoUnitarioEstimado?.toString() ?? null,
        version: detail.version,
      })),
    });
  }
}
