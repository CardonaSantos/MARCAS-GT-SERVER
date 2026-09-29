import { CreditApplicationState } from '../../credit.types';
export type CreditDirectoryEntry=Readonly<{solicitudId:number;numero:string|null;pedidoId:number;clienteId:number;estado:CreditApplicationState;creditoId:number|null;montoSolicitado:string;montoAutorizado:string|null;montoFinanciado:string|null;anticipoRequerido:string|null;plazoAutorizadoDias:number|null;integracionEstado:string|null}>;
export interface CreditDirectoryPort{ findByOrderId(pedidoId:number):Promise<CreditDirectoryEntry|null>; }
