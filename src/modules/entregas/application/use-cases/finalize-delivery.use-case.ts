import { DispatchDirectoryPort } from '../../../despachos';
import { OrderDeliveryGatePort } from '../../../pedidos';
import {
  TransportDeliveryGatePort,
  TransportDirectoryPort,
} from '../../../transporte';
import { DeliveryRepositoryPort } from '../../domain/ports/delivery.repository.port';
import { Delivery } from '../../domain/entities/delivery.entity';
import { DeliveryValidationError } from '../../domain/errors/delivery.errors';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { FinalizeDeliveryCommand } from '../models/delivery.models';
import { deliveryContext } from './delivery.helpers';

export class FinalizeDeliveryUseCase {
  constructor(
    private readonly repository: DeliveryRepositoryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly transport: TransportDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
    private readonly orders: OrderDeliveryGatePort,
    private readonly transportGate: TransportDeliveryGatePort,
  ) {}

  async execute(command: FinalizeDeliveryCommand) {
    const { actor, delivery, stop } = await deliveryContext(
      command.id, command.actorId, this.repository, this.actors, this.transport, this.dispatches,
    );
    if (!stop) throw new DeliveryValidationError('La entrega no está vinculada a una parada de transporte.');

    const loaded = new Map(stop.carga.map((x) => [x.ordenDespachoDetalleId, x.cantidadCargada]));
    const lines = delivery.detalles.map((line) => ({
      ...line,
      cantidadCargada: loaded.get(line.ordenDespachoDetalleId) ?? 0,
    }));

    Delivery.restore({
      estado: delivery.estado,
      version: delivery.version,
      detalles: lines,
    }).validateFinalization({
      resultado: command.resultado,
      receptorNombre: command.receptorNombre ?? delivery.receptorNombre,
      latitud: command.latitud ?? delivery.latitud,
      longitud: command.longitud ?? delivery.longitud,
      motivoNoEntrega: command.motivoNoEntrega,
      detalleNoEntrega: command.detalleNoEntrega,
      evidencias: delivery.evidencias,
      modalidad: stop.modalidad,
      lineas: lines,
    });

    await this.orders.registerDelivery({
      pedidoId: delivery.pedidoId,
      entregaId: delivery.id,
      actorId: actor.id,
      empresaId: actor.empresaId,
      resultado: command.resultado,
      detalles: delivery.detalles.map((x) => ({
        entregaDetalleId: x.id,
        pedidoDetalleId: x.pedidoDetalleId,
        cantidadEntregada: x.cantidadEntregada,
      })),
    });

    await this.transportGate.markStopResult({
      envioDespachoId: stop.envioDespachoId,
      actorId: actor.id,
      resultado: command.resultado,
      detalle: command.observaciones ?? command.detalleNoEntrega,
      claveIdempotencia: `${command.claveIdempotencia}:TRANSPORT`,
    });

    const refreshed = await this.repository.findById(delivery.id);
    if (!refreshed) throw new DeliveryValidationError('La entrega dejó de existir durante la finalización.');
    if (['ENTREGADA', 'PARCIAL', 'RECHAZADA', 'NO_ENTREGADA'].includes(refreshed.estado)) {
      return refreshed;
    }

    await this.repository.finalize({
      id: refreshed.id,
      actorId: actor.id,
      expectedVersion: refreshed.version,
      resultado: command.resultado,
      receptorNombre: command.receptorNombre,
      receptorDocumento: command.receptorDocumento,
      latitud: command.latitud,
      longitud: command.longitud,
      motivoNoEntrega: command.motivoNoEntrega,
      detalleNoEntrega: command.detalleNoEntrega,
      observaciones: command.observaciones,
      claveIdempotencia: command.claveIdempotencia,
    });

    return this.repository.findById(delivery.id);
  }
}
