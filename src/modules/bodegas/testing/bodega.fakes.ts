import { BodegaAuditDraft, BodegaOperationalDependencies, BodegaUserSnapshot } from '../domain/bodega.types';
import { Bodega } from '../domain/entities/bodega.entity';
import { BodegaCompanyContextPort } from '../domain/ports/bodega-company-context.port';
import { BodegaOperationalDependenciesPort } from '../domain/ports/bodega-operational-dependencies.port';
import { BodegaRepositoryPort } from '../domain/ports/bodega.repository.port';
import { BodegaUserDirectoryPort } from '../domain/ports/bodega-user-directory.port';

export class InMemoryBodegaRepository implements BodegaRepositoryPort {
  private sequence = 1;
  readonly rows: Bodega[] = [];
  readonly audits: Array<{ bodegaId: number; audit: BodegaAuditDraft }> = [];

  async findById(id: number): Promise<Bodega | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findPrincipal(): Promise<Bodega | null> {
    return this.rows.find((row) => row.esPrincipal) ?? null;
  }

  async existsByCode(code: string, excludeId?: number): Promise<boolean> {
    return this.rows.some(
      (row) => row.codigo === code && (!excludeId || row.id !== excludeId),
    );
  }

  async create(
    bodega: Bodega,
    audits: readonly BodegaAuditDraft[],
  ): Promise<Bodega> {
    if (bodega.esPrincipal) {
      for (const row of this.rows) row.unmarkAsPrincipal();
    }

    const snapshot = bodega.snapshot();
    const persisted = Bodega.rehydrate({ ...snapshot, id: this.sequence++ });
    this.rows.push(persisted);
    this.storeAudits(persisted.id!, audits);
    return persisted;
  }

  async update(
    bodega: Bodega,
    audits: readonly BodegaAuditDraft[],
  ): Promise<Bodega> {
    const index = this.rows.findIndex((row) => row.id === bodega.id);
    if (index >= 0) this.rows[index] = bodega;
    this.storeAudits(bodega.id!, audits);
    return bodega;
  }

  async setPrincipal(
    bodegaId: number,
    audit: BodegaAuditDraft,
  ): Promise<Bodega> {
    for (const row of this.rows) {
      if (row.id !== bodegaId) row.unmarkAsPrincipal();
    }
    const target = await this.findById(bodegaId);
    if (!target) throw new Error('Target not found in fake repository');
    if (!target.esPrincipal) target.markAsPrincipal();
    this.storeAudits(bodegaId, [audit]);
    return target;
  }

  private storeAudits(
    bodegaId: number,
    audits: readonly BodegaAuditDraft[],
  ): void {
    for (const audit of audits) this.audits.push({ bodegaId, audit });
  }
}

export class StaticCompanyContext implements BodegaCompanyContextPort {
  constructor(private readonly companyId = 1) {}
  async getCurrentCompanyId(): Promise<number> {
    return this.companyId;
  }
}

export class InMemoryBodegaUserDirectory implements BodegaUserDirectoryPort {
  readonly users = new Map<number, BodegaUserSnapshot>();

  async findById(userId: number): Promise<BodegaUserSnapshot | null> {
    return this.users.get(userId) ?? null;
  }
}

export class StaticOperationalDependencies
  implements BodegaOperationalDependenciesPort
{
  value: BodegaOperationalDependencies = {
    stockReal: 0,
    stockReservado: 0,
    requisicionesPendientes: 0,
    transferenciasPendientes: 0,
    despachosPendientes: 0,
    enviosPendientes: 0,
  };

  async inspect(): Promise<BodegaOperationalDependencies> {
    return this.value;
  }
}
