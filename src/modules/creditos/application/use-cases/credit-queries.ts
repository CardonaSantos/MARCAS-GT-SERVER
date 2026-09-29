import { CreditApplicationNotFoundError, CreditPolicyNotFoundError } from '../../domain/errors/credit.errors';
import { CreditActorDirectoryPort } from '../../domain/ports/credit-actor-directory.port';
import { CreditEventFilters, CreditListFilters, CreditPortfolioFilters, CreditSummaryFilters } from '../models/credit.models';
import { CreditQueryPort } from '../ports/credit-query.port';
import { readScope, requireCreditActor } from './credit.helpers';
export class CreditQueries{
 constructor(private readonly query:CreditQueryPort,private readonly users:CreditActorDirectoryPort){}
 async list(filters:Omit<CreditListFilters,'empresaId'>,actorId:number){const a=await requireCreditActor(this.users,actorId);const s=readScope(a);return this.query.list({...filters,empresaId:s.empresaId,...(s.vendedorId?{vendedorId:s.vendedorId}:{})});}
 async get(id:number,actorId:number){const a=await requireCreditActor(this.users,actorId);const result=await this.query.getById(id,readScope(a));if(!result)throw new CreditApplicationNotFoundError(id);return result;}
 async events(id:number,filters:Omit<CreditEventFilters,'empresaId'|'vendedorId'>,actorId:number){const a=await requireCreditActor(this.users,actorId);const scope=readScope(a);const exists=await this.query.getById(id,scope);if(!exists)throw new CreditApplicationNotFoundError(id);return this.query.listEvents(id,{...filters,empresaId:scope.empresaId,...(scope.vendedorId?{vendedorId:scope.vendedorId}:{})});}
 async summary(filters:Omit<CreditSummaryFilters,'empresaId'>,actorId:number){const a=await requireCreditActor(this.users,actorId);const s=readScope(a);return this.query.getSummary({...filters,empresaId:s.empresaId,...(s.vendedorId?{vendedorId:s.vendedorId}:{})});}
 async portfolio(filters:Omit<CreditPortfolioFilters,'empresaId'>,actorId:number){const a=await requireCreditActor(this.users,actorId);const s=readScope(a);return this.query.listPortfolio({...filters,empresaId:s.empresaId,...(s.vendedorId?{vendedorId:s.vendedorId}:{})});}
 async policies(filters:{page:number;limit:number;search?:string;activo?:boolean},actorId:number){const a=await requireCreditActor(this.users,actorId);return this.query.listPolicies({...filters,empresaId:a.empresaId});}
 async policy(id:number,actorId:number){const a=await requireCreditActor(this.users,actorId);const row=await this.query.getPolicy(id,a.empresaId);if(!row)throw new CreditPolicyNotFoundError(id);return row;}
}
