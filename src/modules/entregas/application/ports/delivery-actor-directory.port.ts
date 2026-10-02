import { DeliveryActor } from '../../delivery.types';
export interface DeliveryActorDirectoryPort {
  findById(id: number): Promise<DeliveryActor | null>;
}
