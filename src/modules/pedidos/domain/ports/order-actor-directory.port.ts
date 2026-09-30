import { OrderActorEntry } from '../../order.types';

export interface OrderActorDirectoryPort {
  findById(id: number): Promise<OrderActorEntry | null>;
}
