import { ActorComprobante } from '../../domain/comprobante.types';
export interface ComprobanteActorPort {
  /** Autoriza usuario activo y determina su empresa desde la BD, no desde parametros HTTP. */
  findActive(id: number): Promise<ActorComprobante | null>;
}
