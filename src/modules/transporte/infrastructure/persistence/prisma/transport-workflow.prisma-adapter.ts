import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  TransportConcurrentModificationError,
  TransportIdempotencyConflictError,
  TransportIncidentNotFoundError,
  TransportInvalidStateError,
  TransportQuantityExceededError,
  TransportValidationError,
} from '../../../domain/errors/transport.errors';
import { CreateShipmentPersistenceInput, TransportWorkflowPort } from '../../../domain/ports/transport-workflow.port';

@Injectable()
export class TransportWorkflowPrismaAdapter implements TransportWorkflowPort {
  constructor(private readonly prisma: PrismaService) {}

  async createShipment(input: CreateShipmentPersistenceInput) {
    return this.prisma.$transaction(async (tx) => {
      const requestedByDetail = new Map<number, number>();

      for (const stop of input.paradas) {
        for (const line of stop.cargas) {
          requestedByDetail.set(
            line.ordenDespachoDetalleId,
            (requestedByDetail.get(line.ordenDespachoDetalleId) ?? 0) +
              line.cantidadPlanificada,
          );
        }
      }

      const detailIds = [...requestedByDetail.keys()].sort((a, b) => a - b);

      if (detailIds.length) {
        // El lock sobre OrdenDespachoDetalle serializa planificación/carga
        // concurrente para la misma línea física del despacho.
        await tx.$queryRaw`
          SELECT "id"
          FROM "OrdenDespachoDetalle"
          WHERE "id" IN (${Prisma.join(detailIds)})
          ORDER BY "id"
          FOR UPDATE
        `;

        const [sources, alreadyPlanned] = await Promise.all([
          tx.ordenDespachoDetalle.findMany({
            where: { id: { in: detailIds } },
            select: {
              id: true,
              cantidadPreparada: true,
            },
          }),
          tx.envioCargaDetalle.groupBy({
            by: ['ordenDespachoDetalleId'],
            where: {
              ordenDespachoDetalleId: { in: detailIds },
              envioDespacho: {
                envio: {
                  estado: { not: 'CANCELADO' },
                },
              },
            },
            _sum: {
              cantidadPlanificada: true,
            },
          }),
        ]);

        const sourceById = new Map(sources.map((row) => [row.id, row]));
        const plannedById = new Map(
          alreadyPlanned.map((row) => [
            row.ordenDespachoDetalleId,
            row._sum.cantidadPlanificada ?? 0,
          ]),
        );

        for (const detailId of detailIds) {
          const source = sourceById.get(detailId);

          if (!source) {
            throw new TransportValidationError(
              'Una línea de despacho ya no existe.',
              { ordenDespachoDetalleId: detailId },
            );
          }

          const requested = requestedByDetail.get(detailId) ?? 0;
          const planned = plannedById.get(detailId) ?? 0;
          const available = Math.max(0, source.cantidadPreparada - planned);

          if (requested > available) {
            throw new TransportQuantityExceededError({
              ordenDespachoDetalleId: detailId,
              preparada: source.cantidadPreparada,
              yaPlanificada: planned,
              disponiblePlanificar: available,
              solicitada: requested,
            });
          }
        }
      }

      const created = await tx.envio.create({
        data: {
          numero: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          empresaId: input.empresaId,
          bodegaId: input.bodegaId,
          modalidad: input.modalidad,
          creadoPorId: input.creadoPorId,
          estado: 'PROGRAMADO',
          salidaProgramadaEn: input.salidaProgramadaEn ?? null,
          entregaEstimadaEn: input.entregaEstimadaEn ?? null,
          guia: input.guia?.trim() || null,
          costo: input.costo ?? null,
          trackingUrl: input.trackingUrl?.trim() || null,
          comprobanteUrl: input.comprobanteUrl?.trim() || null,
          observaciones: input.observaciones?.trim() || null,
          despachos: {
            create: input.paradas.map((stop) => ({
              ordenDespachoId: stop.ordenDespachoId,
              clienteId: stop.clienteId,
              secuencia: stop.secuencia,
              destinatario: stop.destinatario,
              telefonoDestino: stop.telefonoDestino ?? null,
              direccionDestino: stop.direccionDestino,
              latitudDestino: stop.latitudDestino ?? null,
              longitudDestino: stop.longitudDestino ?? null,
              estado: 'PENDIENTE',
              cargas: {
                create: stop.cargas.map((line) => ({
                  ordenDespachoDetalleId: line.ordenDespachoDetalleId,
                  productoId: line.productoId,
                  cantidadPlanificada: line.cantidadPlanificada,
                  cantidadCargada: 0,
                })),
              },
            })),
          },
        },
        select: { id: true },
      });

      const numero = `ENV-${String(created.id).padStart(6, '0')}`;

      await tx.envio.update({
        where: { id: created.id },
        data: { numero },
      });

      await tx.envioEvento.create({
        data: {
          envioId: created.id,
          usuarioId: input.creadoPorId,
          tipo: 'CREADO',
          estado: 'PROGRAMADO',
          descripcion: 'Envío logístico creado.',
          metadata: {
            bodegaId: input.bodegaId,
            modalidad: input.modalidad,
            paradas: input.paradas.length,
          },
        },
      });

      return { id: created.id, numero };
    });
  }

  async assignResources(input:any) {
    await this.runIdempotent(
      input.claveIdempotencia,
      input.shipmentId,
      'ASIGNADO',
      async tx => {
      const shipment = await tx.envio.findUnique({ where:{id:input.shipmentId} });
      if(!shipment) throw new TransportValidationError('El envío no existe.');
      if(shipment.estado!=='PROGRAMADO') throw new TransportInvalidStateError(shipment.estado,'asignar recursos');
      if(input.modalidad==='INTERNO') {
        const v=await tx.vehiculo.updateMany({where:{id:input.vehiculoId,empresaId:shipment.empresaId,activo:true,estado:'DISPONIBLE'},data:{estado:'RESERVADO',version:{increment:1}}});
        if(v.count!==1) throw new TransportConcurrentModificationError({recurso:'VEHICULO'});
        const d=await tx.conductor.updateMany({where:{id:input.conductorId,empresaId:shipment.empresaId,activo:true,estado:'DISPONIBLE'},data:{estado:'ASIGNADO',version:{increment:1}}});
        if(d.count!==1) throw new TransportConcurrentModificationError({recurso:'CONDUCTOR'});
      }
      const e=await tx.envio.updateMany({where:{id:input.shipmentId,version:input.expectedVersion,estado:'PROGRAMADO'},data:{transportistaId:input.transportistaId??null,vehiculoId:input.vehiculoId??null,conductorId:input.conductorId??null,responsableId:input.responsableId??null,asignadoPorId:input.actorId,asignadoEn:new Date(),estado:'ASIGNADO',version:{increment:1}}});
      if(e.count!==1) throw new TransportConcurrentModificationError({envioId:input.shipmentId});
      await tx.envioEvento.create({data:{envioId:input.shipmentId,usuarioId:input.actorId,tipo:'ASIGNADO',estado:'ASIGNADO',descripcion:'Recursos asignados.',claveIdempotencia:input.claveIdempotencia,metadata:{transportistaId:input.transportistaId??null,vehiculoId:input.vehiculoId??null,conductorId:input.conductorId??null,responsableId:input.responsableId??null}}});
    });
  }

  async confirmLoad(input: any) {
    await this.runIdempotent(
      input.claveIdempotencia,
      input.shipmentId,
      'CARGA_CONFIRMADA',
      async (tx) => {
        const shipment = await tx.envio.findUnique({
          where: { id: input.shipmentId },
          include: {
            despachos: {
              include: {
                cargas: true,
              },
            },
          },
        });

        if (!shipment) {
          throw new TransportValidationError('El envío no existe.');
        }

        if (shipment.estado !== 'ASIGNADO') {
          throw new TransportInvalidStateError(
            shipment.estado,
            'confirmar carga',
          );
        }

        const allLoads = shipment.despachos.flatMap((stop) => stop.cargas);
        const loadById = new Map(allLoads.map((load) => [load.id, load]));
        const requestedByLoad = new Map<number, number>();

        for (const line of input.lineas) {
          if (requestedByLoad.has(line.cargaDetalleId)) {
            throw new TransportValidationError(
              'Una línea de carga está repetida en la confirmación.',
              { cargaDetalleId: line.cargaDetalleId },
            );
          }

          const current = loadById.get(line.cargaDetalleId);

          if (!current) {
            throw new TransportValidationError(
              'Una línea de carga no pertenece al envío.',
              { cargaDetalleId: line.cargaDetalleId },
            );
          }

          if (
            line.cantidadCargada <= 0 ||
            line.cantidadCargada > current.cantidadPlanificada
          ) {
            throw new TransportQuantityExceededError({
              cargaDetalleId: current.id,
              planificada: current.cantidadPlanificada,
              solicitada: line.cantidadCargada,
            });
          }

          requestedByLoad.set(line.cargaDetalleId, line.cantidadCargada);
        }

        const detailIds = [
          ...new Set(allLoads.map((load) => load.ordenDespachoDetalleId)),
        ].sort((a, b) => a - b);

        if (detailIds.length) {
          await tx.$queryRaw`
            SELECT "id"
            FROM "OrdenDespachoDetalle"
            WHERE "id" IN (${Prisma.join(detailIds)})
            ORDER BY "id"
            FOR UPDATE
          `;

          const [sources, loadedElsewhere] = await Promise.all([
            tx.ordenDespachoDetalle.findMany({
              where: { id: { in: detailIds } },
              select: {
                id: true,
                cantidadDespachada: true,
              },
            }),
            tx.envioCargaDetalle.groupBy({
              by: ['ordenDespachoDetalleId'],
              where: {
                ordenDespachoDetalleId: { in: detailIds },
                envioDespacho: {
                  envio: {
                    id: { not: input.shipmentId },
                    estado: { not: 'CANCELADO' },
                  },
                },
              },
              _sum: {
                cantidadCargada: true,
              },
            }),
          ]);

          const sourceById = new Map(sources.map((row) => [row.id, row]));
          const elsewhereById = new Map(
            loadedElsewhere.map((row) => [
              row.ordenDespachoDetalleId,
              row._sum.cantidadCargada ?? 0,
            ]),
          );
          const proposedCurrentById = new Map<number, number>();

          for (const load of allLoads) {
            const proposed =
              requestedByLoad.get(load.id) ?? load.cantidadCargada;

            proposedCurrentById.set(
              load.ordenDespachoDetalleId,
              (proposedCurrentById.get(load.ordenDespachoDetalleId) ?? 0) +
                proposed,
            );
          }

          for (const detailId of detailIds) {
            const source = sourceById.get(detailId);

            if (!source) {
              throw new TransportValidationError(
                'Una línea de despacho ya no existe.',
                { ordenDespachoDetalleId: detailId },
              );
            }

            const elsewhere = elsewhereById.get(detailId) ?? 0;
            const currentShipment = proposedCurrentById.get(detailId) ?? 0;
            const totalProposed = elsewhere + currentShipment;

            if (totalProposed > source.cantidadDespachada) {
              throw new TransportQuantityExceededError({
                ordenDespachoDetalleId: detailId,
                despachada: source.cantidadDespachada,
                cargadaOtrosEnvios: elsewhere,
                cargadaEnvioActual: currentShipment,
                totalPropuesto: totalProposed,
              });
            }
          }
        }

        for (const line of input.lineas) {
          await tx.envioCargaDetalle.update({
            where: { id: line.cargaDetalleId },
            data: {
              cantidadCargada: line.cantidadCargada,
              version: { increment: 1 },
            },
          });
        }

        const refreshed = await tx.envioCargaDetalle.findMany({
          where: {
            envioDespacho: {
              envioId: input.shipmentId,
            },
          },
          select: {
            cantidadCargada: true,
          },
        });

        if (
          !refreshed.length ||
          refreshed.some((line) => line.cantidadCargada <= 0)
        ) {
          throw new TransportValidationError(
            'Todas las líneas deben tener carga confirmada.',
          );
        }

        const updated = await tx.envio.updateMany({
          where: {
            id: input.shipmentId,
            version: input.expectedVersion,
            estado: 'ASIGNADO',
          },
          data: {
            estado: 'CARGADO',
            cargaConfirmadaPorId: input.actorId,
            cargaConfirmadaEn: new Date(),
            version: { increment: 1 },
          },
        });

        if (updated.count !== 1) {
          throw new TransportConcurrentModificationError({
            envioId: input.shipmentId,
          });
        }

        await tx.envioEvento.create({
          data: {
            envioId: input.shipmentId,
            usuarioId: input.actorId,
            tipo: 'CARGA_CONFIRMADA',
            estado: 'CARGADO',
            descripcion: 'Carga confirmada.',
            claveIdempotencia: input.claveIdempotencia,
          },
        });
      },
    );
  }

  async startRoute(input:any) {
    await this.runIdempotent(
      input.claveIdempotencia,
      input.shipmentId,
      'RUTA_INICIADA',
      async tx => {
      const s=await tx.envio.findUnique({where:{id:input.shipmentId}}); if(!s)throw new TransportValidationError('El envío no existe.'); if(s.estado!=='CARGADO')throw new TransportInvalidStateError(s.estado,'iniciar ruta');
      if(s.modalidad==='INTERNO') { if(s.vehiculoId){const v=await tx.vehiculo.updateMany({where:{id:s.vehiculoId,estado:'RESERVADO',activo:true},data:{estado:'EN_RUTA',version:{increment:1}}});if(v.count!==1)throw new TransportConcurrentModificationError({recurso:'VEHICULO'});} if(s.conductorId){const d=await tx.conductor.updateMany({where:{id:s.conductorId,estado:'ASIGNADO',activo:true},data:{estado:'EN_RUTA',version:{increment:1}}});if(d.count!==1)throw new TransportConcurrentModificationError({recurso:'CONDUCTOR'});} }
      const e=await tx.envio.updateMany({where:{id:input.shipmentId,version:input.expectedVersion,estado:'CARGADO'},data:{estado:'EN_RUTA',iniciadoPorId:input.actorId,salidaEn:new Date(),version:{increment:1}}}); if(e.count!==1)throw new TransportConcurrentModificationError({envioId:input.shipmentId});
      await tx.envioDespacho.updateMany({where:{envioId:input.shipmentId,estado:'PENDIENTE'},data:{estado:'EN_RUTA',version:{increment:1}}});
      await tx.envioEvento.create({data:{envioId:input.shipmentId,usuarioId:input.actorId,tipo:'RUTA_INICIADA',estado:'EN_RUTA',descripcion:'Ruta iniciada.',latitud:input.latitud??null,longitud:input.longitud??null,claveIdempotencia:input.claveIdempotencia}});
    });
  }

  async cancelShipment(input:any) {
    await this.runIdempotent(
      input.claveIdempotencia,
      input.shipmentId,
      'CANCELADO',
      async tx => {
      const s=await tx.envio.findUnique({where:{id:input.shipmentId}}); if(!s)throw new TransportValidationError('El envío no existe.'); if(!['PROGRAMADO','ASIGNADO'].includes(s.estado))throw new TransportInvalidStateError(s.estado,'cancelar');
      if(s.estado==='ASIGNADO'&&s.modalidad==='INTERNO'){if(s.vehiculoId)await tx.vehiculo.updateMany({where:{id:s.vehiculoId,estado:'RESERVADO'},data:{estado:'DISPONIBLE',version:{increment:1}}});if(s.conductorId)await tx.conductor.updateMany({where:{id:s.conductorId,estado:'ASIGNADO'},data:{estado:'DISPONIBLE',version:{increment:1}}});}
      const e=await tx.envio.updateMany({where:{id:input.shipmentId,version:input.expectedVersion,estado:{in:['PROGRAMADO','ASIGNADO']}},data:{estado:'CANCELADO',canceladoPorId:input.actorId,canceladoEn:new Date(),motivoCancelacion:input.motivo.trim(),version:{increment:1}}}); if(e.count!==1)throw new TransportConcurrentModificationError({envioId:input.shipmentId});
      await tx.envioDespacho.updateMany({where:{envioId:input.shipmentId},data:{estado:'CANCELADA',version:{increment:1}}});
      await tx.envioEvento.create({data:{envioId:input.shipmentId,usuarioId:input.actorId,tipo:'CANCELADO',estado:'CANCELADO',descripcion:input.motivo.trim(),claveIdempotencia:input.claveIdempotencia}});
    });
  }

  async addObservation(input:any){const s=await this.prisma.envio.findUniqueOrThrow({where:{id:input.shipmentId},select:{estado:true}});await this.prisma.envioEvento.create({data:{envioId:input.shipmentId,usuarioId:input.actorId,tipo:'OBSERVACION',estado:s.estado,descripcion:input.detalle.trim(),claveIdempotencia:input.claveIdempotencia??null}});}

  async reportIncident(input:any){const old=await this.prisma.envioIncidencia.findUnique({where:{claveIdempotencia:input.claveIdempotencia},select:{id:true,envioId:true}});if(old){if(old.envioId===input.shipmentId)return {id:old.id};throw new TransportIdempotencyConflictError({claveIdempotencia:input.claveIdempotencia,envioId:input.shipmentId,envioExistente:old.envioId});} return this.prisma.$transaction(async tx=>{const s=await tx.envio.findUnique({where:{id:input.shipmentId}});if(!s)throw new TransportValidationError('El envío no existe.');if(!['EN_RUTA','ENTREGADO_PARCIAL','INCIDENCIA'].includes(s.estado))throw new TransportInvalidStateError(s.estado,'reportar incidencia');const i=await tx.envioIncidencia.create({data:{envioId:input.shipmentId,tipo:input.tipo,severidad:input.severidad,estado:'ABIERTA',descripcion:input.descripcion.trim(),reportadaPorId:input.actorId,latitud:input.latitud??null,longitud:input.longitud??null,claveIdempotencia:input.claveIdempotencia},select:{id:true}});await tx.envio.update({where:{id:input.shipmentId},data:{estado:'INCIDENCIA',version:{increment:1}}});await tx.envioEvento.create({data:{envioId:input.shipmentId,usuarioId:input.actorId,tipo:'INCIDENCIA_REPORTADA',estado:'INCIDENCIA',descripcion:input.descripcion.trim(),latitud:input.latitud??null,longitud:input.longitud??null,claveIdempotencia:`${input.claveIdempotencia}:EVENT`,metadata:{incidenciaId:i.id,tipo:input.tipo,severidad:input.severidad}}});return i;});}

  async resolveIncident(input:any){await this.runIdempotent(input.claveIdempotencia,input.shipmentId,'INCIDENCIA_RESUELTA',async tx=>{const i=await tx.envioIncidencia.findFirst({where:{id:input.incidentId,envioId:input.shipmentId}});if(!i)throw new TransportIncidentNotFoundError(input.incidentId);if(i.estado==='RESUELTA')return;await tx.envioIncidencia.update({where:{id:i.id},data:{estado:'RESUELTA',resueltaPorId:input.actorId,resueltaEn:new Date(),resolucion:input.resolucion.trim(),version:{increment:1}}});const open=await tx.envioIncidencia.count({where:{envioId:input.shipmentId,estado:{not:'RESUELTA'},id:{not:i.id}}});const stops=await tx.envioDespacho.findMany({where:{envioId:input.shipmentId},select:{estado:true}});const next=open>0?'INCIDENCIA':stops.some(x=>x.estado==='ATENDIDA')?'ENTREGADO_PARCIAL':'EN_RUTA';await tx.envio.update({where:{id:input.shipmentId},data:{estado:next,version:{increment:1}}});await tx.envioEvento.create({data:{envioId:input.shipmentId,usuarioId:input.actorId,tipo:'INCIDENCIA_RESUELTA',estado:next,descripcion:input.resolucion.trim(),claveIdempotencia:input.claveIdempotencia,metadata:{incidenciaId:i.id}}});});}

  private async runIdempotent(
    key: string,
    shipmentId: number,
    eventType: string,
    action: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    if (!key?.trim()) {
      throw new TransportValidationError(
        'La clave de idempotencia es obligatoria.',
      );
    }

    const existing = await this.prisma.envioEvento.findUnique({
      where: { claveIdempotencia: key },
      select: {
        id: true,
        envioId: true,
        tipo: true,
      },
    });

    if (existing) {
      if (existing.envioId === shipmentId && existing.tipo === eventType) {
        return;
      }

      throw new TransportIdempotencyConflictError({
        claveIdempotencia: key,
        envioId: shipmentId,
        eventoExistente: existing.tipo,
        envioExistente: existing.envioId,
      });
    }

    try {
      await this.prisma.$transaction(action);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new TransportIdempotencyConflictError({
          claveIdempotencia: key,
        });
      }

      throw error;
    }
  }
}
