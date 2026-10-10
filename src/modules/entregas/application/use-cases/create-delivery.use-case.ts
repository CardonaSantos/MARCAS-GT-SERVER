import { DispatchDirectoryPort } from '../../../despachos';
import { TransportDirectoryPort } from '../../../transporte';
import { DeliveryRepositoryPort } from '../../domain/ports/delivery.repository.port';
import {
  DeliveryForbiddenError,
  DeliveryValidationError,
} from '../../domain/errors/delivery.errors';
import { DeliveryActorDirectoryPort } from '../ports/delivery-actor-directory.port';
import { CreateDeliveryCommand } from '../models/delivery.models';
import { assertDeliveryOperator, requireDeliveryActor } from './delivery.helpers';

export class CreateDeliveryUseCase {
  constructor(
    private readonly repository: DeliveryRepositoryPort,
    private readonly actors: DeliveryActorDirectoryPort,
    private readonly transport: TransportDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
  ) {}

  async execute(command: CreateDeliveryCommand) {
    const actor = await requireDeliveryActor(this.actors, command.actorId);

    const existingByKey = await this.repository.findByIdempotencyKey(command.claveIdempotencia);
    if (existingByKey) {
      if (existingByKey.envioDespachoId !== command.envioDespachoId) {
        throw new DeliveryValidationError('La clave de idempotencia pertenece a otra entrega.');
      }
      return existingByKey;
    }

    const stop = await this.transport.findStopById(command.envioDespachoId);
    if (!stop) throw new DeliveryValidationError('La parada de transporte no existe.');
    if (stop.empresaId !== actor.empresaId) throw new DeliveryForbiddenError('La parada pertenece a otra empresa.');
    assertDeliveryOperator(actor, stop.responsableId);

    if (!['EN_RUTA', 'INCIDENCIA', 'ENTREGADO_PARCIAL'].includes(stop.envioEstado)) {
      throw new DeliveryValidationError('El envío debe estar en ruta para crear la entrega.');
    }
    if (stop.paradaEstado !== 'EN_RUTA') {
      throw new DeliveryValidationError('La parada debe estar EN_RUTA para iniciar una entrega.');
    }

    const old = await this.repository.findByStopId(stop.envioDespachoId);
    if (old) return old;

    const dispatch = await this.dispatches.findById(stop.ordenDespachoId);
    if (!dispatch || dispatch.empresaId !== actor.empresaId) {
      throw new DeliveryValidationError('La orden de despacho asociada no es válida.');
    }

    const dispatchLines = new Map(dispatch.detalles.map((x) => [x.id, x]));
    const detalles = stop.carga
      .filter((line) => line.cantidadCargada > 0)
      .map((line) => {
        const source = dispatchLines.get(line.ordenDespachoDetalleId);
        if (!source || source.productoId !== line.productoId) {
          throw new DeliveryValidationError('La carga no coincide con la orden de despacho.', {
            ordenDespachoDetalleId: line.ordenDespachoDetalleId,
          });
        }
        return {
          ordenDespachoDetalleId: source.id,
          pedidoDetalleId: source.pedidoDetalleId,
          productoId: source.productoId,
        };
      });

    if (!detalles.length) {
      throw new DeliveryValidationError('La parada no contiene mercancía cargada para entregar.');
    }

    return this.repository.create({
      ordenDespachoId: stop.ordenDespachoId,
      pedidoId: dispatch.pedidoId,
      clienteId: stop.clienteId,
      envioDespachoId: stop.envioDespachoId,
      registradoPorId: actor.id,
      claveIdempotencia: command.claveIdempotencia,
      detalles,
      audit: {
        actorId: actor.id,
        tipo: 'CREADA',
        estado: 'PENDIENTE',
        detalle: `Entrega creada desde la parada #${stop.envioDespachoId} del envío ${stop.envioNumero}.`,
        referenciaTipo: 'ENVIO_DESPACHO',
        referenciaId: stop.envioDespachoId,
        claveIdempotencia: `${command.claveIdempotencia}:EVENT`,
      },
    });
  }
}
