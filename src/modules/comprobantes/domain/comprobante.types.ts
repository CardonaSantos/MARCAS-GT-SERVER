/** Comprobantes operativos, sin efectos en inventario, cobranza o certificacion FEL. */
export type TipoComprobante = 'SALIDA_DESPACHO' | 'ENTREGA';
export type AccionComprobante = 'EMITIDO' | 'IMPRESION_SOLICITADA' | 'DESCARGA_SOLICITADA' | 'COMPARTICION_PREPARADA';

export interface ActorComprobante {
  id: number;
  empresaId: number;
}

export interface DocumentoBorrador {
  tipo: TipoComprobante;
  referenciaId: number;
  /** Datos del hecho operativo, listos para render A4 o termico sin consultar otros endpoints. */
  snapshot: Record<string, unknown>;
}

export interface ComprobanteEmitido extends DocumentoBorrador {
  id: number;
  numero: string;
  empresaId: number;
  version: number;
  huellaSha256: string;
  emitidoPorId: number;
  emitidoEn: Date;
}

export interface CrearComprobante {
  empresaId: number;
  tipo: TipoComprobante;
  referenciaId: number;
  numero: string;
  snapshot: Record<string, unknown>;
  huellaSha256: string;
  emitidoPorId: number;
}

export interface RegistrarAccionComprobante {
  comprobanteId: number;
  empresaId: number;
  usuarioId: number;
  accion: Exclude<AccionComprobante, 'EMITIDO'>;
  canal?: string;
  claveIdempotencia: string;
}
