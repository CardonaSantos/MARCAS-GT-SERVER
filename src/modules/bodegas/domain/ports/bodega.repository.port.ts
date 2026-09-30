import { Bodega } from '../entities/bodega.entity';
import { BodegaAuditDraft } from '../bodega.types';

export interface BodegaRepositoryPort {
  findById(id: number): Promise<Bodega | null>;
  findPrincipal(): Promise<Bodega | null>;
  existsByCode(code: string, excludeId?: number): Promise<boolean>;

  create(
    bodega: Bodega,
    audits: readonly BodegaAuditDraft[],
  ): Promise<Bodega>;

  update(
    bodega: Bodega,
    audits: readonly BodegaAuditDraft[],
  ): Promise<Bodega>;

  setPrincipal(
    bodegaId: number,
    audit: BodegaAuditDraft,
  ): Promise<Bodega>;
}
