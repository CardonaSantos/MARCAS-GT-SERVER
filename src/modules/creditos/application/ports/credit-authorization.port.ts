export type CreditAuthorizationEntry=Readonly<{pedidoId:number;solicitudId:number;creditoId:number;approved:boolean;montoAutorizado:string;montoFinanciado:string;anticipoRequerido:string;plazoAutorizadoDias:number;integrationApplied:boolean}>;
export interface CreditAuthorizationPort{ getOrderAuthorization(pedidoId:number):Promise<CreditAuthorizationEntry|null>; }
