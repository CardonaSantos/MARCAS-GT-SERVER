import { CreditActorEntry } from '../../credit.types';
export interface CreditActorDirectoryPort { findById(id:number):Promise<CreditActorEntry|null>; }
