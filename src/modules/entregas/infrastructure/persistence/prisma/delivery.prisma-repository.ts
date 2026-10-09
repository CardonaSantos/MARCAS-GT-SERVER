import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  DeliveryRepositoryPort,
  DeliveryWriteModel,
} from '../../../domain/ports/delivery.repository.port';
import {
  DeliveryConcurrentModificationError,
  DeliveryIdempotencyConflictError,
  DeliveryNotFoundError,
  DeliveryValidationError,
} from '../../../domain/errors/delivery.errors';

@Injectable()
export class DeliveryPrismaRepository implements DeliveryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private include = { detalles: true, evidencias: true } as const;

  private map(row: any): DeliveryWriteModel {
    return {
      ...row,
      latitud: row.latitud == null ? null : Number(row.latitud),
      longitud: row.longitud == null ? null : Number(row.longitud),
      detalles: row.detalles,
      evidencias: row.evidencias,
    };
  }

  async findById(id: number) {
    const row = await this.prisma.entrega.findUnique({ where: { id }, include: this.include });
    return row ? this.map(row) : null;
  }

  async findByStopId(envioDespachoId: number) {
    const row = await this.prisma.entrega.findUnique({ where: { envioDespachoId }, include: this.include });
    return row ? this.map(row) : null;
  }

  async findByIdempotencyKey(key: string) {
    const row = await this.prisma.entrega.findUnique({ where: { claveIdempotencia: key }, include: this.include });
    return row ? this.map(row) : null;
  }

  async create(input: any) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.entrega.create({
          data: {
            ordenDespachoId: input.ordenDespachoId,
            pedidoId: input.pedidoId,
            clienteId: input.clienteId,
            envioDespachoId: input.envioDespachoId,
            registradoPorId: input.registradoPorId,
            estado: 'PENDIENTE',
            claveIdempotencia: input.claveIdempotencia,
            detalles: { create: input.detalles.map((x: any) => ({
              ordenDespachoDetalleId: x.ordenDespachoDetalleId,
              pedidoDetalleId: x.pedidoDetalleId,
              productoId: x.productoId,
              cantidadEntregada: 0,
              cantidadRechazada: 0,
            })) },
          },
          include: this.include,
        });
        await tx.entregaEvento.create({
          data: {
            entregaId: created.id,
            usuarioId: input.audit.actorId ?? null,
            tipo: input.audit.tipo,
            estado: input.audit.estado,
            detalle: input.audit.detalle ?? null,
            referenciaTipo: input.audit.referenciaTipo ?? null,
            referenciaId: input.audit.referenciaId ?? null,
            claveIdempotencia: input.audit.claveIdempotencia ?? null,
            metadata: input.audit.metadata ?? undefined,
          },
        });
        return created;
      });
      return this.map(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const old = await this.findByIdempotencyKey(input.claveIdempotencia);
        if (old && old.envioDespachoId === input.envioDespachoId) return old;
        throw new DeliveryIdempotencyConflictError({ claveIdempotencia: input.claveIdempotencia });
      }
      throw error;
    }
  }

  async start(input: any): Promise<void> {
    const old = await this.prisma.entregaEvento.findUnique({ where: { claveIdempotencia: input.claveIdempotencia } });
    if (old) return;
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.entrega.updateMany({
        where: { id: input.id, version: input.expectedVersion, estado: 'PENDIENTE' },
        data: {
          estado: 'EN_RUTA',
          iniciadaEn: new Date(),
          latitud: input.latitud ?? undefined,
          longitud: input.longitud ?? undefined,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new DeliveryConcurrentModificationError({ entregaId: input.id });
      await tx.entregaEvento.create({
        data: {
          entregaId: input.id,
          usuarioId: input.actorId,
          tipo: 'INICIADA',
          estado: 'EN_RUTA',
          detalle: 'Atención de entrega iniciada.',
          claveIdempotencia: input.claveIdempotencia,
        },
      });
    });
  }

  async updateResult(input: any): Promise<void> {
    // Repetir exactamente el mismo envío del formulario no duplica el inicio.
    if (input.claveIdempotencia) {
      const previous = await this.prisma.entregaEvento.findUnique({
        where: { claveIdempotencia: input.claveIdempotencia },
        select: { entregaId: true },
      });
      if (previous) {
        if (previous.entregaId !== input.id) {
          throw new DeliveryIdempotencyConflictError({ claveIdempotencia: input.claveIdempotencia });
        }
        return;
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const parent = await tx.entrega.updateMany({
        where: {
          id: input.id,
          version: input.expectedVersion,
          estado: input.iniciarAtencion ? 'PENDIENTE' : 'EN_RUTA',
        },
        data: {
          ...(input.iniciarAtencion ? { estado: 'EN_RUTA' as const, iniciadaEn: new Date() } : {}),
          receptorNombre: input.receptorNombre === undefined ? undefined : input.receptorNombre?.trim() || null,
          receptorDocumento: input.receptorDocumento === undefined ? undefined : input.receptorDocumento?.trim() || null,
          latitud: input.latitud === undefined ? undefined : input.latitud,
          longitud: input.longitud === undefined ? undefined : input.longitud,
          observaciones: input.observaciones === undefined ? undefined : input.observaciones?.trim() || null,
          version: { increment: 1 },
        },
      });
      if (parent.count !== 1) throw new DeliveryConcurrentModificationError({ entregaId: input.id });

      for (const line of input.detalles) {
        const current = await tx.entregaDetalle.findFirst({ where: { id: line.id, entregaId: input.id } });
        if (!current) throw new DeliveryValidationError('Detalle de entrega inválido.', { detalleId: line.id });
        const changed = await tx.entregaDetalle.updateMany({
          where: { id: current.id, version: current.version },
          data: {
            cantidadEntregada: line.cantidadEntregada,
            cantidadRechazada: line.cantidadRechazada,
            motivoRechazo: line.motivoRechazo?.trim() || null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new DeliveryConcurrentModificationError({ entregaDetalleId: current.id });
      }

      if (input.iniciarAtencion) {
        await tx.entregaEvento.create({
          data: {
            entregaId: input.id,
            usuarioId: input.actorId,
            tipo: 'INICIADA',
            estado: 'EN_RUTA',
            detalle: 'Atención iniciada al registrar el resultado físico.',
            claveIdempotencia: 'DELIVERY:AUTO_START:' + input.id,
            metadata: {
              origen: 'REGISTRO_RESULTADO',
              latitudInicial: input.latitud ?? null,
              longitudInicial: input.longitud ?? null,
            },
          },
        });
      }
      if (input.claveIdempotencia) {
        await tx.entregaEvento.create({
          data: {
            entregaId: input.id,
            usuarioId: input.actorId,
            tipo: 'OBSERVACION',
            estado: 'EN_RUTA',
            detalle: 'Resultado físico registrado.',
            claveIdempotencia: input.claveIdempotencia,
            metadata: {
              origen: 'REGISTRO_RESULTADO',
              lineas: input.detalles.map((x: any) => ({
                detalleId: x.id,
                entregada: x.cantidadEntregada,
                rechazada: x.cantidadRechazada,
              })),
            },
          },
        });
      }
    });
  }

  async findEvidenceByIdempotencyKey(key: string) {
    return this.prisma.entregaEvidencia.findUnique({
      where: { claveIdempotencia: key },
      select: { id: true, entregaId: true, key: true },
    });
  }

  async addEvidence(input: any) {
    const old = await this.prisma.entregaEvidencia.findUnique({ where: { claveIdempotencia: input.claveIdempotencia }, select: { id: true, entregaId: true } });
    if (old) {
      if (old.entregaId !== input.entregaId) throw new DeliveryIdempotencyConflictError({ claveIdempotencia: input.claveIdempotencia });
      return { id: old.id };
    }
    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.entrega.findUnique({ where: { id: input.entregaId }, select: { estado: true } });
      if (!delivery) throw new DeliveryNotFoundError(input.entregaId);
      const evidence = await tx.entregaEvidencia.create({
        data: {
          entregaId: input.entregaId,
          tipo: input.tipo,
          url: input.url,
          key: input.key ?? null,
          mimeType: input.mimeType ?? null,
          size: input.size ?? null,
          descripcion: input.descripcion?.trim() || null,
          claveIdempotencia: input.claveIdempotencia,
        },
        select: { id: true },
      });
      await tx.entregaEvento.create({
        data: {
          entregaId: input.entregaId,
          usuarioId: input.actorId,
          tipo: 'EVIDENCIA_AGREGADA',
          estado: delivery.estado,
          detalle: `Evidencia ${input.tipo} agregada.`,
          referenciaTipo: 'ENTREGA_EVIDENCIA',
          referenciaId: evidence.id,
          claveIdempotencia: `${input.claveIdempotencia}:EVENT`,
        },
      });
      return evidence;
    });
  }

  async removeEvidence(input: any) {
    return this.prisma.$transaction(async (tx) => {
      const evidence = await tx.entregaEvidencia.findFirst({
        where: { id: input.evidenciaId, entregaId: input.entregaId },
        select: { id: true, key: true },
      });
      if (!evidence) return null;
      await tx.entregaEvidencia.delete({ where: { id: evidence.id } });
      return { key: evidence.key };
    });
  }

  async finalize(input: any): Promise<void> {
    const event = await this.prisma.entregaEvento.findUnique({ where: { claveIdempotencia: input.claveIdempotencia }, select: { id: true } });
    if (event) return;

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.entrega.updateMany({
        where: { id: input.id, version: input.expectedVersion, estado: 'EN_RUTA' },
        data: {
          estado: input.resultado,
          receptorNombre: input.receptorNombre === undefined ? undefined : input.receptorNombre?.trim() || null,
          receptorDocumento: input.receptorDocumento === undefined ? undefined : input.receptorDocumento?.trim() || null,
          latitud: input.latitud === undefined ? undefined : input.latitud,
          longitud: input.longitud === undefined ? undefined : input.longitud,
          motivoNoEntrega: input.motivoNoEntrega ?? null,
          detalleNoEntrega: input.detalleNoEntrega?.trim() || null,
          observaciones: input.observaciones === undefined ? undefined : input.observaciones?.trim() || null,
          entregadoEn: ['ENTREGADA', 'PARCIAL'].includes(input.resultado) ? new Date() : null,
          finalizadaEn: new Date(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new DeliveryConcurrentModificationError({ entregaId: input.id });
      const type = input.resultado === 'PARCIAL' ? 'ENTREGA_PARCIAL' : input.resultado;
      await tx.entregaEvento.create({
        data: {
          entregaId: input.id,
          usuarioId: input.actorId,
          tipo: type,
          estado: input.resultado,
          detalle: input.observaciones?.trim() || input.detalleNoEntrega?.trim() || `Entrega finalizada: ${input.resultado}.`,
          claveIdempotencia: input.claveIdempotencia,
          metadata: { motivoNoEntrega: input.motivoNoEntrega ?? null },
        },
      });
    });
  }

  async addObservation(input: any): Promise<void> {
    const old = await this.prisma.entregaEvento.findUnique({ where: { claveIdempotencia: input.claveIdempotencia } });
    if (old) return;
    const delivery = await this.prisma.entrega.findUnique({ where: { id: input.id }, select: { estado: true } });
    if (!delivery) throw new DeliveryNotFoundError(input.id);
    await this.prisma.entregaEvento.create({
      data: {
        entregaId: input.id,
        usuarioId: input.actorId,
        tipo: 'OBSERVACION',
        estado: delivery.estado,
        detalle: input.detalle.trim(),
        claveIdempotencia: input.claveIdempotencia,
      },
    });
  }
}
