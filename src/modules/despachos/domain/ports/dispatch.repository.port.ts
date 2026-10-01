import { OrdenDespacho } from '../entities/dispatch-order.entity';
import { DispatchAuditDraft } from '../../dispatch.types';

export type DispatchSaveOptions = Readonly<{ replaceDetails?: boolean }>;

export interface DispatchRepositoryPort {
  findById(id: number): Promise<OrdenDespacho | null>;
  create(entity: OrdenDespacho, audit: DispatchAuditDraft): Promise<OrdenDespacho>;
  save(
    entity: OrdenDespacho,
    expectedVersion: number,
    audits?: readonly DispatchAuditDraft[],
    options?: DispatchSaveOptions,
  ): Promise<OrdenDespacho>;
  hasOperations(id: number): Promise<boolean>;
  activeProgrammedByOrderDetail(
    pedidoId: number,
    excludeDispatchId?: number,
  ): Promise<Map<number, number>>;
  appendEvent(dispatchId: number, audit: DispatchAuditDraft): Promise<void>;
}
