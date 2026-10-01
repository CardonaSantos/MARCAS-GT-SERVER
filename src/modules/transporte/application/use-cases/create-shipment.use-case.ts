import { BodegaDirectoryPort } from '../../../bodegas';
import { DispatchDirectoryPort } from '../../../despachos';
import { Shipment } from '../../domain/entities/shipment.entity';
import {
  TransportDispatchNotEligibleError,
  TransportDispatchNotFoundError,
  TransportQuantityExceededError,
} from '../../domain/errors/transport.errors';
import { TransportWorkflowPort } from '../../domain/ports/transport-workflow.port';
import { TransportActorDirectoryPort } from '../ports/transport-actor-directory.port';
import { assertPlanner, requireTransportActor } from './transport.helpers';
export class CreateShipmentUseCase {
  constructor(
    private readonly workflow: TransportWorkflowPort,
    private readonly actors: TransportActorDirectoryPort,
    private readonly bodegas: BodegaDirectoryPort,
    private readonly dispatches: DispatchDirectoryPort,
  ) {}
  async execute(command: any) {
    const actor = await requireTransportActor(this.actors, command.actorId);
    assertPlanner(actor);
    const bodega = await this.bodegas.findById(command.bodegaId);
    if (!bodega || !bodega.activo || bodega.empresaId !== actor.empresaId)
      throw new TransportDispatchNotEligibleError(
        'La bodega no está disponible para la empresa.',
        { bodegaId: command.bodegaId },
      );
    const stops = [];
    for (const stop of command.paradas) {
      const dispatch = await this.dispatches.findTransportPlanningById(
        stop.ordenDespachoId,
      );
      if (!dispatch)
        throw new TransportDispatchNotFoundError(stop.ordenDespachoId);
      if (
        dispatch.empresaId !== actor.empresaId ||
        dispatch.bodegaId !== command.bodegaId
      )
        throw new TransportDispatchNotEligibleError(
          'Todos los despachos deben pertenecer a la misma empresa y bodega.',
          { ordenDespachoId: stop.ordenDespachoId },
        );
      if (
        !['PREPARADA', 'PARCIALMENTE_DESPACHADA', 'DESPACHADA'].includes(
          dispatch.estado,
        )
      )
        throw new TransportDispatchNotEligibleError(
          'El despacho aún no está preparado para Transporte.',
          { estado: dispatch.estado },
        );
      const map = new Map(dispatch.detalles.map((x) => [x.id, x]));
      const cargas = stop.cargas.map((line: any) => {
        const d = map.get(line.ordenDespachoDetalleId);
        if (!d)
          throw new TransportDispatchNotEligibleError(
            'Una línea no pertenece al despacho indicado.',
          );
        if (
          line.cantidadPlanificada <= 0 ||
          line.cantidadPlanificada > d.cantidadPreparada
        )
          throw new TransportQuantityExceededError({
            detalleId: d.id,
            preparada: d.cantidadPreparada,
            solicitada: line.cantidadPlanificada,
          });
        return {
          ordenDespachoDetalleId: d.id,
          productoId: d.productoId,
          cantidadPlanificada: line.cantidadPlanificada,
        };
      });
      stops.push({
        ordenDespachoId: dispatch.id,
        clienteId: dispatch.cliente.id,
        secuencia: stop.secuencia,
        destinatario: dispatch.destino.destinatario,
        telefonoDestino: dispatch.destino.telefono,
        direccionDestino: dispatch.destino.direccion,
        latitudDestino: dispatch.destino.latitud,
        longitudDestino: dispatch.destino.longitud,
        cargas,
      });
    }
    Shipment.create({
      empresaId: actor.empresaId,
      bodegaId: command.bodegaId,
      modalidad: command.modalidad,
      paradas: stops,
    });
    return this.workflow.createShipment({
      empresaId: actor.empresaId,
      bodegaId: command.bodegaId,
      modalidad: command.modalidad,
      creadoPorId: actor.id,
      salidaProgramadaEn: command.salidaProgramadaEn,
      entregaEstimadaEn: command.entregaEstimadaEn,
      guia: command.guia,
      costo: command.costo,
      trackingUrl: command.trackingUrl,
      comprobanteUrl: command.comprobanteUrl,
      observaciones: command.observaciones,
      paradas: stops,
    });
  }
}
