import { BodegaDirectoryPort } from '../../../bodegas';
import { Requisition } from '../../domain/entities/requisition.entity';
import { RequisitionActorDirectoryPort } from '../../domain/ports/requisition-actor-directory.port';
import { RequisitionCatalogPort } from '../../domain/ports/requisition-catalog.port';
import { RequisitionRepositoryPort } from '../../domain/ports/requisition.repository.port';
import { CreateRequisitionCommand } from '../models/requisition.models';
import {
  requireActiveActor,
  requireActiveWarehouse,
  requireProducts,
  requireProvider,
} from './requisition-use-case.helpers';

export class CreateRequisitionUseCase {
  constructor(
    private readonly repository: RequisitionRepositoryPort,
    private readonly users: RequisitionActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly catalog: RequisitionCatalogPort,
  ) {}

  async execute(command: CreateRequisitionCommand): Promise<Requisition> {
    const actor = await requireActiveActor(this.users, command.actorId);
    await requireActiveWarehouse(this.bodegas, command.bodegaDestinoId);
    if (command.proveedorId) await requireProvider(this.catalog, command.proveedorId);
    const details = command.detalles ?? [];
    await requireProducts(
      this.catalog,
      details.map((detail) => detail.productoId),
    );

    const entity = Requisition.create({
      empresaId: actor.empresaId!,
      bodegaDestinoId: command.bodegaDestinoId,
      proveedorId: command.proveedorId ?? null,
      solicitanteId: command.actorId,
      observaciones: command.observaciones ?? null,
      detalles: details.map((detail) => ({
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        cantidadRecibida: 0,
        costoUnitarioEstimado: detail.costoUnitarioEstimado ?? null,
        version: 0,
      })),
    });

    return this.repository.create(entity, {
      actorId: command.actorId,
      type: 'CREADA',
      detail: 'Requisición creada en borrador.',
    });
  }
}
