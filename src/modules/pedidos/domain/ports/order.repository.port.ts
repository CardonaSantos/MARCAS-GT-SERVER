import { Pedido } from '../entities/order.entity';
import { OrderAuditDraft } from '../../order.types';

export type OrderSaveOptions = Readonly<{
  replaceDetails?: boolean;
}>;

export interface OrderRepositoryPort {
  findById(id: number): Promise<Pedido | null>;
  create(entity: Pedido, audit: OrderAuditDraft): Promise<Pedido>;
  save(
    entity: Pedido,
    expectedVersion: number,
    audit: OrderAuditDraft,
    options?: OrderSaveOptions,
  ): Promise<Pedido>;
}
