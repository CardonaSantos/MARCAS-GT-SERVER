import { BodegaDirectoryPort } from '../../../bodegas';
import { InventoryAvailabilityPort } from '../../../inventario';
import {
  TransferInsufficientAvailabilityError,
  TransferNotFoundError,
} from '../../domain/errors/transfer.errors';
import { TransferActorDirectoryPort } from '../../domain/ports/transfer-actor-directory.port';
import { TransferRepositoryPort } from '../../domain/ports/transfer.repository.port';
import { TransferActionCommand } from '../models/transfer.models';
import {
  requireActiveTransferActor,
  requireTransferProducts,
  requireTransferWarehouses,
} from './transfer-use-case.helpers';

export class PrepareTransferUseCase {
  constructor(
    private readonly repository: TransferRepositoryPort,
    private readonly users: TransferActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly inventory: InventoryAvailabilityPort,
  ) {}

  async execute(command: TransferActionCommand) {
    await requireActiveTransferActor(this.users, command.actorId);

    const entity = await this.repository.findById(command.id);
    if (!entity) throw new TransferNotFoundError(command.id);

    await requireTransferWarehouses(
      this.bodegas,
      entity.bodegaOrigenId,
      entity.bodegaDestinoId,
    );

    await requireTransferProducts(
      this.inventory,
      entity.detalles.map((detail) => detail.productoId),
    );

    for (const detail of entity.detalles) {
      const available = await this.inventory.hasAvailability(
        entity.bodegaOrigenId,
        detail.productoId,
        detail.cantidadSolicitada,
      );
      if (!available) {
        throw new TransferInsufficientAvailabilityError({
          bodegaOrigenId: entity.bodegaOrigenId,
          productoId: detail.productoId,
          cantidadSolicitada: detail.cantidadSolicitada,
        });
      }
    }

    const expectedVersion = entity.version;
    entity.prepare();

    return this.repository.save(entity, expectedVersion, {
      actorId: command.actorId,
      type: 'PREPARADA',
      detail: 'Transferencia preparada y validada contra disponibilidad.',
    });
  }
}
