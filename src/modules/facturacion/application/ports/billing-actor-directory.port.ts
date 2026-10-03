import { BillingActor } from '../../billing.types';

export interface BillingActorDirectoryPort {
  findById(id: number): Promise<BillingActor | null>;
}
