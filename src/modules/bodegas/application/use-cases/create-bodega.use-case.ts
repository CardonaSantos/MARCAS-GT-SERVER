import { Bodega } from '../../domain/entities/bodega.entity';
import { BodegaAuditDraft } from '../../domain/bodega.types';
import { BodegaCodeConflictError } from '../../domain/errors/bodega.errors';
import { BodegaCompanyContextPort } from '../../domain/ports/bodega-company-context.port';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';
import { BodegaUserDirectoryPort } from '../../domain/ports/bodega-user-directory.port';
import { BodegaCode } from '../../domain/value-objects/bodega-code.vo';
import { CreateBodegaCommand } from '../models/bodega.models';
import { requireValidBodegaResponsible } from './bodega-use-case.helpers';

export class CreateBodegaUseCase {
  constructor(
    private readonly repository: BodegaRepositoryPort,
    private readonly companyContext: BodegaCompanyContextPort,
    private readonly userDirectory: BodegaUserDirectoryPort,
  ) {}

  async execute(command: CreateBodegaCommand): Promise<Bodega> {
    const normalizedCode = BodegaCode.create(command.codigo).value;

    if (await this.repository.existsByCode(normalizedCode)) {
      throw new BodegaCodeConflictError(normalizedCode);
    }

    if (command.responsableId != null) {
      await requireValidBodegaResponsible(
        this.userDirectory,
        command.responsableId,
      );
    }

    const [empresaId, currentPrincipal] = await Promise.all([
      this.companyContext.getCurrentCompanyId(),
      this.repository.findPrincipal(),
    ]);

    const shouldBePrincipal = command.esPrincipal === true || !currentPrincipal;

    const bodega = Bodega.create({
      empresaId,
      codigo: normalizedCode,
      nombre: command.nombre,
      descripcion: command.descripcion,
      direccion: command.direccion,
      telefono: command.telefono,
      responsableId: command.responsableId,
      esPrincipal: shouldBePrincipal,
    });

    const audits: BodegaAuditDraft[] = [
      {
        actorId: command.actorId,
        type: 'CREADA' as const,
        detail: 'Bodega creada.',
        metadata: { codigo: bodega.codigo, nombre: bodega.nombre },
      },
    ];

    if (shouldBePrincipal) {
      audits.push({
        actorId: command.actorId,
        type: 'ESTABLECIDA_PRINCIPAL' as const,
        detail: currentPrincipal
          ? 'La bodega fue creada y establecida como principal.'
          : 'Primera bodega creada; establecida automáticamente como principal.',
        metadata: {
          principalAnteriorId: currentPrincipal?.id ?? null,
        },
      });
    }

    return this.repository.create(bodega, audits);
  }
}
