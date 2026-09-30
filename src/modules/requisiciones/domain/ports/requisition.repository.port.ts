import { Requisition } from '../entities/requisition.entity';
import { RequisitionAuditDraft, RequisitionReceiptState } from '../requisition.types';

export type ReceiptDraftLine = Readonly<{
  requisicionDetalleId: number;
  cantidad: number;
  costoUnitario: string;
}>;

export type PrepareReceiptCommand = Readonly<{
  requisicionId: number;
  recibidoPorId: number;
  claveIdempotencia: string;
  documentoReferencia?: string | null;
  observaciones?: string | null;
  recibidoEn?: Date | null;
  detalles: ReceiptDraftLine[];
}>;

export type PreparedReceiptLine = Readonly<{
  id: number;
  requisicionDetalleId: number;
  productoId: number;
  cantidad: number;
  costoUnitario: string;
}>;

export type PreparedReceipt = Readonly<{
  id: number;
  requisicionId: number;
  bodegaDestinoId: number;
  proveedorId: number;
  recibidoPorId: number;
  estado: RequisitionReceiptState;
  claveIdempotencia: string;
  repeated: boolean;
  detalles: PreparedReceiptLine[];
}>;

export interface RequisitionRepositoryPort {
  findById(id: number): Promise<Requisition | null>;
  create(entity: Requisition, audit: RequisitionAuditDraft): Promise<Requisition>;
  save(
    entity: Requisition,
    expectedVersion: number,
    audit: RequisitionAuditDraft,
  ): Promise<Requisition>;
  prepareReceipt(command: PrepareReceiptCommand): Promise<PreparedReceipt>;
  markReceiptFailed(receiptId: number, error: string): Promise<void>;
  finalizeReceipt(receiptId: number, actorId: number): Promise<void>;
}
