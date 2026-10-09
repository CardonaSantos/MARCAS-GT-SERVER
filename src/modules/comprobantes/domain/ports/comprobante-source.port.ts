import { DocumentoBorrador } from '../comprobante.types';

export interface ComprobanteSourcePort {
  /** Verifica pertenencia a empresa, tipo, estado y movimientos aplicados. */
  salida(despachoId: number, operacionId: number, empresaId: number): Promise<DocumentoBorrador | null>;
  /** Solo un intento de entrega finalizado tiene valor documental definitivo. */
  entrega(entregaId: number, empresaId: number): Promise<DocumentoBorrador | null>;
}
