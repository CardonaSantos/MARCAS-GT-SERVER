import {
  CreditPolicy,
  CreditPolicyRequirementProps,
} from '../../domain/entities/credit-policy.entity';
import {
  CreditForbiddenError,
  CreditPolicyNotFoundError,
} from '../../domain/errors/credit.errors';
import { CreditActorDirectoryPort } from '../../domain/ports/credit-actor-directory.port';
import { CreditPolicyRepositoryPort } from '../../domain/ports/credit.repositories';
import { requireCreditActor } from './credit.helpers';
export class CreditPolicyCommands {
  constructor(
    private readonly repo: CreditPolicyRepositoryPort,
    private readonly users: CreditActorDirectoryPort,
  ) {}
  private async admin(actorId: number) {
    const a = await requireCreditActor(this.users, actorId);
    if (a.rol !== 'ADMIN')
      throw new CreditForbiddenError(
        'Solo ADMIN puede administrar políticas de crédito.',
      );
    return a;
  }
  async create(input: {
    nombre: string;
    descripcion?: string | null;
    montoMaximo?: string | null;
    plazoMaximoDias?: number | null;
    porcentajeAnticipo?: string | null;
    requisitos?: CreditPolicyRequirementProps[];
    actorId: number;
  }) {
    const a = await this.admin(input.actorId);
    return this.repo.createPolicy(
      CreditPolicy.create({
        empresaId: a.empresaId,
        nombre: input.nombre,
        descripcion: input.descripcion,
        montoMaximo: input.montoMaximo,
        plazoMaximoDias: input.plazoMaximoDias,
        porcentajeAnticipo: input.porcentajeAnticipo,
        requisitos: input.requisitos ?? [],
      }),
    );
  }
  async update(
    id: number,
    input: {
      nombre?: string;
      descripcion?: string | null;
      montoMaximo?: string | null;
      plazoMaximoDias?: number | null;
      porcentajeAnticipo?: string | null;
      requisitos?: CreditPolicyRequirementProps[];
    },
    actorId: number,
  ) {
    const a = await this.admin(actorId);
    const row = await this.repo.findPolicyById(id);
    if (!row || row.empresaId !== a.empresaId)
      throw new CreditPolicyNotFoundError(id);
    const e = CreditPolicy.rehydrate({ ...row, requisitos: row.requisitos });
    const expected = e.version;
    e.update(input);
    return this.repo.updatePolicy(e, expected, input.requisitos !== undefined);
  }
  async setStatus(
    id: number,
    active: boolean,
    reason: string | null | undefined,
    actorId: number,
  ) {
    const a = await this.admin(actorId);
    const row = await this.repo.findPolicyById(id);
    if (!row || row.empresaId !== a.empresaId)
      throw new CreditPolicyNotFoundError(id);
    const e = CreditPolicy.rehydrate({ ...row, requisitos: row.requisitos });
    const expected = e.version;
    e.setActive(active, reason);
    return this.repo.setPolicyStatus(e, expected);
  }
}
