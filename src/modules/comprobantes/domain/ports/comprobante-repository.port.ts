import {
  ComprobanteEmitido, CrearComprobante, RegistrarAccionComprobante, TipoComprobante,
} from '../comprobante.types';

export interface ComprobanteRepositoryPort {
  findBySource(empresaId: number, tipo: TipoComprobante, referenciaId: number): Promise<ComprobanteEmitido | null>;
  findById(empresaId: number, id: number): Promise<ComprobanteEmitido | null>;
  /** Unique(empresa, tipo, referencia); reintento seguro aun bajo concurrencia. */
  issue(command: CrearComprobante): Promise<ComprobanteEmitido>;
  /** Registra solicitud, no afirma que la impresora o destinatario la recibio. */
  action(command: RegistrarAccionComprobante): Promise<{ id: number; repeated: boolean }>;
}
