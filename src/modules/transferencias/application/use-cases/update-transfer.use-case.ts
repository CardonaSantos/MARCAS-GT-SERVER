import { BodegaDirectoryPort } from '../../../bodegas';
import { InventoryAvailabilityPort } from '../../../inventario';
import { TransferNotFoundError } from '../../domain/errors/transfer.errors';
import { TransferActorDirectoryPort } from '../../domain/ports/transfer-actor-directory.port';
import { TransferRepositoryPort } from '../../domain/ports/transfer.repository.port';
import { UpdateTransferCommand } from '../models/transfer.models';
import {
  requireActiveTransferActor,
  requireTransferProducts,
  requireTransferWarehouses,
} from './transfer-use-case.helpers';

export class UpdateTransferUseCase {
  constructor(
    private readonly repository: TransferRepositoryPort,
    private readonly users: TransferActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly inventory: InventoryAvailabilityPort,
  ) {}

  async execute(command: UpdateTransferCommand) {
    await requireActiveTransferActor(this.users, command.actorId);

    const entity = await this.repository.findById(command.id);
    if (!entity) throw new TransferNotFoundError(command.id);

    const originId = command.bodegaOrigenId ?? entity.bodegaOrigenId;
    const destinationId = command.bodegaDestinoId ?? entity.bodegaDestinoId;

    await requireTransferWarehouses(
      this.bodegas,
      originId,
      destinationId,
    );

    if (command.detalles !== undefined) {
      await requireTransferProducts(
        this.inventory,
        command.detalles.map((detail) => detail.productoId),
      );
    }

    const expectedVersion = entity.version;
    entity.replaceDraftData({
      bodegaOrigenId: command.bodegaOrigenId,
      bodegaDestinoId: command.bodegaDestinoId,
      observaciones: command.observaciones,
      detalles: command.detalles?.map((detail) => ({
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        observaciones: detail.observaciones,
      })),
    });

    return this.repository.save(entity, expectedVersion, {
      actorId: command.actorId,
      type: 'ACTUALIZADA',
      detail: 'Transferencia actualizada.',
    });
  }
}
