import { PaymentActor } from '../../payment.types';

export interface PaymentActorDirectoryPort {
  findById(id: number): Promise<PaymentActor | null>;
}
