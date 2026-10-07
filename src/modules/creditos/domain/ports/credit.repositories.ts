import { CreditAuditDraft, CreditDecisionType, CreditDocumentState, CreditDocumentType, CreditIntegrationState, CreditIntegrationType, CreditPaymentPlanFrequency, CreditPaymentPlanState, CreditReferenceResult, CreditReferenceType, CreditRequirementState } from '../../credit.types';
import { CreditApplication } from '../entities/credit-application.entity';
import { CreditPolicy } from '../entities/credit-policy.entity';
export type CreditRequirementSnapshot=Readonly<{politicaRequisitoId:number|null;codigo:string;nombre:string;descripcion:string|null;obligatorio:boolean;orden:number}>;
export type CreditPolicyEntry=Readonly<{id:number;empresaId:number;nombre:string;descripcion:string|null;activo:boolean;montoMaximo:string|null;plazoMaximoDias:number|null;porcentajeAnticipo:string|null;version:number;requisitos:ReadonlyArray<{id:number;codigo:string;nombre:string;descripcion:string|null;obligatorio:boolean;orden:number;activo:boolean}>}>;
export type CreditReadiness=Readonly<{requisitosObligatorios:number;requisitosCumplidos:number;requisitosPendientes:number;requisitosNoCumplidos:number;referencias:number;referenciasPendientes:number;documentos:number;documentosPendientes:number}>;
export type CreditDecisionCommitResult=Readonly<{repeated:boolean;solicitudId:number;decisionId:number|null;creditoId:number|null;decisionType:CreditDecisionType|null;integrationOperationId:number;integrationState:CreditIntegrationState}>;
export type CreditIntegrationOperation=Readonly<{id:number;solicitudId:number;pedidoId:number;empresaId:number;actorId:number;tipo:CreditIntegrationType;estado:CreditIntegrationState;intentos:number;reason:string|null}>;
export interface CreditApplicationRepositoryPort{
 findById(id:number):Promise<CreditApplication|null>; findActiveByOrderId(orderId:number):Promise<CreditApplication|null>;
 create(entity:CreditApplication,requirements:CreditRequirementSnapshot[],audit:CreditAuditDraft):Promise<CreditApplication>;
 save(entity:CreditApplication,expectedVersion:number,audit:CreditAuditDraft,options?:Readonly<{replaceRequirements?:CreditRequirementSnapshot[]}>):Promise<CreditApplication>;
}
export interface CreditEvidenceRepositoryPort{
 addReference(input:{solicitudId:number;tipo:CreditReferenceType;nombre:string;telefono:string;relacion?:string|null;observaciones?:string|null;audit:CreditAuditDraft}):Promise<{id:number}>;
 updateReference(input:{solicitudId:number;referenciaId:number;nombre?:string;telefono?:string;relacion?:string|null;observaciones?:string|null;audit:CreditAuditDraft}):Promise<void>;
 reviewReference(input:{solicitudId:number;referenciaId:number;resultado:Exclude<CreditReferenceResult,'PENDIENTE'>;observaciones?:string|null;actorId:number;audit:CreditAuditDraft}):Promise<void>;
 addDocument(input:{solicitudId:number;tipo:CreditDocumentType;url:string;key?:string|null;mimeType?:string|null;size?:number|null;observaciones?:string|null;audit:CreditAuditDraft}):Promise<{id:number}>;
 reviewDocument(input:{solicitudId:number;documentoId:number;estado:Exclude<CreditDocumentState,'PENDIENTE'>;observaciones?:string|null;actorId:number;audit:CreditAuditDraft}):Promise<void>;
 reviewRequirement(input:{solicitudId:number;requisitoId:number;estado:Exclude<CreditRequirementState,'PENDIENTE'>;observaciones?:string|null;actorId:number;audit:CreditAuditDraft}):Promise<void>;
 getReadiness(solicitudId:number):Promise<CreditReadiness>;
}
export interface CreditDecisionRepositoryPort{
 approve(input:{application:CreditApplication;expectedVersion:number;actorId:number;tipo:Extract<CreditDecisionType,'APROBADA'|'AJUSTADA'>;montoAutorizado:string;anticipoRequerido:string;plazoAutorizadoDias:number;observaciones?:string|null;claveIdempotencia:string}):Promise<CreditDecisionCommitResult>;
 reject(input:{application:CreditApplication;expectedVersion:number;actorId:number;observaciones:string;claveIdempotencia:string}):Promise<CreditDecisionCommitResult>;
 cancel(input:{application:CreditApplication;expectedVersion:number;actorId:number;claveIdempotencia:string}):Promise<CreditDecisionCommitResult>;
}
export interface CreditIntegrationRepositoryPort{
 findByApplicationId(solicitudId:number):Promise<CreditIntegrationOperation|null>;
 findBlockingByOrderId(pedidoId:number):Promise<CreditIntegrationOperation|null>;
 markApplied(input:{operationId:number;actorId:number}):Promise<void>;
 markFailed(input:{operationId:number;actorId:number;error:string}):Promise<void>;
}
export interface CreditPolicyRepositoryPort{
 findPolicyById(id:number):Promise<CreditPolicyEntry|null>;
 createPolicy(entity:CreditPolicy):Promise<CreditPolicyEntry>;
 updatePolicy(entity:CreditPolicy,expectedVersion:number,replaceRequirements:boolean):Promise<CreditPolicyEntry>;
 setPolicyStatus(entity:CreditPolicy,expectedVersion:number):Promise<CreditPolicyEntry>;
}

export type CreditPaymentPlanCreditSnapshot = Readonly<{
 id:number;
 empresaId:number|null;
 clienteId:number|null;
 numero:string|null;
 estado:string;
 montoFinanciado:string|null;
 pedidoId:number|null;
 moneda:string;
}>;

export type CreditPaymentPlanInstallmentSnapshot = Readonly<{
 id:number;
 numero:number;
 montoProgramado:string;
 fechaVencimiento:Date;
 cuentaPorCobrarId:number|null;
}>;

export type CreditPaymentPlanSnapshot = Readonly<{
 id:number;
 empresaId:number;
 creditoId:number;
 estado:CreditPaymentPlanState;
 frecuencia:CreditPaymentPlanFrequency;
 montoProgramado:string;
 numeroCuotas:number;
 primeraFechaVencimiento:Date;
 version:number;
 activadoEn:Date|null;
 cuotas:readonly CreditPaymentPlanInstallmentSnapshot[];
}>;

export type CreditPaymentPlanDraftInstallment = Readonly<{
 numero:number;
 montoProgramado:string;
 fechaVencimiento:Date;
}>;

export interface CreditPaymentPlanRepositoryPort {
 findCreditForPlan(creditoId:number):Promise<CreditPaymentPlanCreditSnapshot|null>;
 createPaymentPlan(input:{
  creditoId:number;
  empresaId:number;
  frecuencia:CreditPaymentPlanFrequency;
  cuotas:readonly CreditPaymentPlanDraftInstallment[];
  actorId:number;
  claveIdempotencia:string;
 }):Promise<CreditPaymentPlanSnapshot>;
 updatePaymentPlan(input:{
  creditoId:number;
  empresaId:number;
  frecuencia:CreditPaymentPlanFrequency;
  cuotas:readonly CreditPaymentPlanDraftInstallment[];
  expectedVersion:number;
  actorId:number;
  claveIdempotencia:string;
 }):Promise<CreditPaymentPlanSnapshot>;
 activatePaymentPlan(input:{
  creditoId:number;
  empresaId:number;
  expectedVersion:number;
  actorId:number;
  claveIdempotencia:string;
 }):Promise<CreditPaymentPlanSnapshot>;
}
