import { BodegaDirectoryPort } from '../../../bodegas';
import { RequisitionNotFoundError } from '../../domain/errors/requisition.errors';
import { RequisitionActorDirectoryPort } from '../../domain/ports/requisition-actor-directory.port';
import { RequisitionCatalogPort } from '../../domain/ports/requisition-catalog.port';
import { RequisitionRepositoryPort } from '../../domain/ports/requisition.repository.port';
import { UpdateRequisitionCommand } from '../models/requisition.models';
import {
  requireActiveActor,
  requireActiveWarehouse,
  requireProducts,
  requireProvider,
} from './requisition-use-case.helpers';

export class UpdateRequisitionUseCase {
  constructor(
    private readonly repository: RequisitionRepositoryPort,
    private readonly users: RequisitionActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly catalog: RequisitionCatalogPort,
  ) {}

  async execute(command: UpdateRequisitionCommand) {
    await requireActiveActor(this.users, command.actorId);
    const entity = await this.repository.findById(command.id);
    if (!entity) throw new RequisitionNotFoundError(command.id);
    const expectedVersion = entity.version;

    if (command.bodegaDestinoId !== undefined) {
      await requireActiveWarehouse(this.bodegas, command.bodegaDestinoId);
    }
    if (command.proveedorId) await requireProvider(this.catalog, command.proveedorId);
    if (command.detalles) {
      await requireProducts(
        this.catalog,
        command.detalles.map((detail) => detail.productoId),
      );
    }

    entity.replaceDraftData({
      bodegaDestinoId: command.bodegaDestinoId,
      proveedorId: command.proveedorId,
      observaciones: command.observaciones,
      detalles: command.detalles?.map((detail) => ({
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        cantidadRecibida: 0,
        costoUnitarioEstimado: detail.costoUnitarioEstimado ?? null,
        version: 0,
      })),
    });

    return this.repository.save(entity, expectedVersion, {
      actorId: command.actorId,
      type: 'ACTUALIZADA',
      detail: 'Datos de la requisición actualizados.',
    });
  }
}
