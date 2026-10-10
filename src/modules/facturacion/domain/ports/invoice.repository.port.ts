import { FiscalItemType, InvoiceState } from '../../billing.types';

export type InvoiceRepositoryEntry = Readonly<{
  id: number;
  empresaId: number;
  clienteId: number;
  pedidoId: number | null;
  creadoPorId: number | null;
  estado: InvoiceState;
  condicionPago: string | null;
  moneda: string;
  subtotal: string;
  descuentoTotal: string;
  impuestoTotal: string;
  total: string;
  version: number;
  emitidaEn: Date | null;
  descartadaEn: Date | null;
  motivoDescarte: string | null;
  detalles: ReadonlyArray<{
    id: number;
    productoId: number;
    pedidoDetalleId: number | null;
    entregaDetalleId: number | null;
    descripcion: string;
    bienOServicio: FiscalItemType;
    unidadMedida: string;
    cantidad: number;
    precioUnitario: string;
    precioBruto: string;
    descuento: string;
    impuestoTotal: string;
    totalLinea: string;
  }>;
}>;

export type CreateInvoiceDraftInput = Readonly<{
  empresaId: number;
  clienteId: number;
  pedidoId: number;
  creadoPorId: number;
  condicionPago: string;
  moneda: string;
  claveIdempotencia: string;
  entregaIds: readonly number[];
  lineas: readonly {
    entregaId: number;
    entregaDetalleId: number;
    pedidoDetalleId: number;
    productoId: number;
    cantidad: number;
    cantidadEntregada: number;
    cantidadSolicitadaPedido: number;
    precioUnitario: string;
    descuentoTotalPedido: string;
    descripcion: string;
    bienOServicio: FiscalItemType;
    unidadMedida: string;
  }[];
}>;

export interface InvoiceRepositoryPort {
  findById(id: number): Promise<InvoiceRepositoryEntry | null>;
  findByIdempotencyKey(key: string): Promise<InvoiceRepositoryEntry | null>;
  createDraft(input: CreateInvoiceDraftInput): Promise<InvoiceRepositoryEntry>;
  discard(
    id: number,
    actorId: number,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<void>;
}
