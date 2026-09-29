import { TransferenciaBodega } from '../entities/transfer.entity';
import { TransferAuditDraft } from '../../transfer.types';

export interface TransferRepositoryPort {
  findById(id: number): Promise<TransferenciaBodega | null>;

  create(
    entity: TransferenciaBodega,
    audit: TransferAuditDraft,
  ): Promise<TransferenciaBodega>;

  save(
    entity: TransferenciaBodega,
    expectedVersion: number,
    audit: TransferAuditDraft,
  ): Promise<TransferenciaBodega>;
}
