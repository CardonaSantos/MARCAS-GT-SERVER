import { CreditApplicationState } from '../../credit.types';
import { CreditInvalidStateError, CreditValidationError } from '../errors/credit.errors';
import { CreditMoney } from '../value-objects/credit-money.vo';
export type CreditApplicationProps=Readonly<{
 id?:number|null; numero?:string|null; empresaId:number; pedidoId:number; clienteId:number; solicitanteId:number;
 politicaId?:number|null; creditoId?:number|null; montoSolicitado:string; plazoDias:number; anticipoPropuesto?:string;
 estado?:CreditApplicationState; motivo?:string|null; solicitadaEn?:Date; enRevisionEn?:Date|null; resueltaEn?:Date|null;
 canceladaEn?:Date|null; motivoCancelacion?:string|null; version?:number; actualizadoEn?:Date;
}>;
export class CreditApplication {
 private constructor(private props:CreditApplicationProps){ this.assertInvariants(); }
 static create(props:Omit<CreditApplicationProps,'estado'|'creditoId'|'solicitadaEn'|'enRevisionEn'|'resueltaEn'|'canceladaEn'|'motivoCancelacion'|'version'>){
  return new CreditApplication({...props,numero:norm(props.numero),montoSolicitado:CreditMoney.from(props.montoSolicitado).toString(),anticipoPropuesto:CreditMoney.from(props.anticipoPropuesto??'0.00').toString(),estado:'PENDIENTE',motivo:norm(props.motivo),creditoId:null,version:0});
 }
 static rehydrate(props:CreditApplicationProps){ return new CreditApplication(props); }
 get id(){return this.props.id??null;} get numero(){return this.props.numero??null;} get empresaId(){return this.props.empresaId;} get pedidoId(){return this.props.pedidoId;} get clienteId(){return this.props.clienteId;} get solicitanteId(){return this.props.solicitanteId;} get politicaId(){return this.props.politicaId??null;} get creditoId(){return this.props.creditoId??null;} get montoSolicitado(){return this.props.montoSolicitado;} get plazoDias(){return this.props.plazoDias;} get anticipoPropuesto(){return this.props.anticipoPropuesto??'0.00';} get estado(){return this.props.estado??'PENDIENTE';} get motivo(){return this.props.motivo??null;} get solicitadaEn(){return this.props.solicitadaEn??new Date();} get enRevisionEn(){return this.props.enRevisionEn??null;} get resueltaEn(){return this.props.resueltaEn??null;} get canceladaEn(){return this.props.canceladaEn??null;} get motivoCancelacion(){return this.props.motivoCancelacion??null;} get version(){return this.props.version??0;} get actualizadoEn(){return this.props.actualizadoEn??new Date();}
 updateDraft(input:{politicaId?:number|null;montoSolicitado?:string;plazoDias?:number;anticipoPropuesto?:string;motivo?:string|null}){
  this.assertState('PENDIENTE','actualizar'); this.props={...this.props,...(input.politicaId!==undefined?{politicaId:input.politicaId}:{}),...(input.montoSolicitado!==undefined?{montoSolicitado:CreditMoney.from(input.montoSolicitado).toString()}:{}),...(input.plazoDias!==undefined?{plazoDias:input.plazoDias}:{}),...(input.anticipoPropuesto!==undefined?{anticipoPropuesto:CreditMoney.from(input.anticipoPropuesto).toString()}:{}),motivo:input.motivo===undefined?this.motivo:norm(input.motivo),version:this.version+1}; this.assertInvariants();
 }
 submitForReview(at=new Date()){ this.assertState('PENDIENTE','enviar a revisión'); this.props={...this.props,estado:'EN_REVISION',enRevisionEn:at,version:this.version+1}; }
 cancel(reason:string,at=new Date()){ if(!['PENDIENTE','EN_REVISION'].includes(this.estado)) throw new CreditInvalidStateError(this.estado,'cancelar'); const r=norm(reason); if(!r||r.length<3) throw new CreditValidationError('El motivo de cancelación debe contener al menos 3 caracteres.'); this.props={...this.props,estado:'CANCELADA',resueltaEn:at,canceladaEn:at,motivoCancelacion:r,version:this.version+1}; }
 assertEvidenceEditable(){ if(!['PENDIENTE','EN_REVISION'].includes(this.estado)) throw new CreditInvalidStateError(this.estado,'modificar expediente'); }
 assertReviewable(){ this.assertState('EN_REVISION','resolver'); }
 private assertState(expected:CreditApplicationState,operation:string){ if(this.estado!==expected) throw new CreditInvalidStateError(this.estado,operation); }
 private assertInvariants(){ pos(this.empresaId,'empresaId');pos(this.pedidoId,'pedidoId');pos(this.clienteId,'clienteId');pos(this.solicitanteId,'solicitanteId'); if(this.politicaId!==null)pos(this.politicaId,'politicaId'); if(this.creditoId!==null)pos(this.creditoId,'creditoId'); if(!Number.isInteger(this.plazoDias)||this.plazoDias<=0) throw new CreditValidationError('El plazo debe ser un entero positivo.'); const m=CreditMoney.from(this.montoSolicitado),a=CreditMoney.from(this.anticipoPropuesto); if(m.isZero())throw new CreditValidationError('El monto solicitado debe ser mayor que cero.'); if(a.isGreaterThan(m))throw new CreditValidationError('El anticipo propuesto no puede superar el monto solicitado.'); if(!Number.isInteger(this.version)||this.version<0)throw new CreditValidationError('La versión de la solicitud es inválida.'); }
}
function norm(v?:string|null){ if(v==null)return null; const s=v.trim(); return s||null; }
function pos(v:number,f:string){ if(!Number.isInteger(v)||v<=0) throw new CreditValidationError(`El campo ${f} es inválido.`,{[f]:v}); }
