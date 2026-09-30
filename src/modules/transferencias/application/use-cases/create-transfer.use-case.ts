import { BodegaDirectoryPort } from '../../../bodegas';
import { InventoryAvailabilityPort } from '../../../inventario';
import { TransferenciaBodega } from '../../domain/entities/transfer.entity';
import { TransferActorDirectoryPort } from '../../domain/ports/transfer-actor-directory.port';
import { TransferRepositoryPort } from '../../domain/ports/transfer.repository.port';
import { CreateTransferCommand } from '../models/transfer.models';
import {
  requireActiveTransferActor,
  requireTransferProducts,
  requireTransferWarehouses,
} from './transfer-use-case.helpers';

export class CreateTransferUseCase {
  constructor(
    private readonly repository: TransferRepositoryPort,
    private readonly users: TransferActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly inventory: InventoryAvailabilityPort,
  ) {}

  async execute(command: CreateTransferCommand): Promise<TransferenciaBodega> {
    await requireActiveTransferActor(this.users, command.actorId);
    await requireTransferWarehouses(
      this.bodegas,
      command.bodegaOrigenId,
      command.bodegaDestinoId,
    );
    await requireTransferProducts(
      this.inventory,
      (command.detalles ?? []).map((detail) => detail.productoId),
    );

    const entity = TransferenciaBodega.create({
      bodegaOrigenId: command.bodegaOrigenId,
      bodegaDestinoId: command.bodegaDestinoId,
      creadoPorId: command.actorId,
      observaciones: command.observaciones,
      detalles: command.detalles?.map((detail) => ({
        productoId: detail.productoId,
        cantidadSolicitada: detail.cantidadSolicitada,
        observaciones: detail.observaciones,
      })),
    });

    return this.repository.create(entity, {
      actorId: command.actorId,
      type: 'CREADA',
      detail: 'Transferencia creada en borrador.',
    });
  }
}
