import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { Pedido } from '../../../domain/entities/order.entity';
import { OrderConcurrentModificationError } from '../../../domain/errors/order.errors';
import { OrderRepositoryPort, OrderSaveOptions } from '../../../domain/ports/order.repository.port';
import { OrderAuditDraft } from '../../../order.types';
import { ORDER_WITH_DETAILS, OrderPrismaMapper } from './order.prisma-mapper';

@Injectable()
export class OrderPrismaRepository implements OrderRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    const row = await this.prisma.pedido.findUnique({
      where: { id },
      include: ORDER_WITH_DETAILS,
    });
    return row ? OrderPrismaMapper.toDomain(row) : null;
  }

  create(entity: Pedido, audit: OrderAuditDraft) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.pedido.create({
        data: {
          empresaId: entity.empresaId,
          clienteId: entity.clienteId,
          vendedorId: entity.vendedorId,
          visitaId: entity.visitaId,
          estado: entity.estado,
          condicionPago: entity.condicionPago,
          estadoPago: entity.estadoPago,
          moneda: entity.moneda,
          subtotal: new Prisma.Decimal(entity.subtotal),
          descuentoTotal: new Prisma.Decimal(entity.descuentoTotal),
          total: new Prisma.Decimal(entity.total),
          observaciones: entity.observaciones,
          version: entity.version,
          detalles: {
            create: entity.detalles.map((detail) => ({
              productoId: detail.productoId,
              cantidadSolicitada: detail.cantidadSolicitada,
              cantidadReservada: detail.cantidadReservada ?? 0,
              cantidadDespachada: detail.cantidadDespachada ?? 0,
              cantidadEntregada: detail.cantidadEntregada ?? 0,
              precioUnitario: new Prisma.Decimal(detail.precioUnitario),
              descuento: new Prisma.Decimal(detail.descuento ?? '0.00'),
              subtotal: new Prisma.Decimal(detail.subtotal ?? '0.00'),
              observaciones: detail.observaciones ?? null,
              version: detail.version ?? 0,
            })),
          },
        },
      });

      await tx.pedido.update({
        where: { id: row.id },
        data: { numero: formatOrderNumber(row.id) },
      });
      await this.createEvent(tx, row.id, audit);
      const persisted = await tx.pedido.findUnique({
        where: { id: row.id },
        include: ORDER_WITH_DETAILS,
      });
      if (!persisted) throw new Error('No se pudo recargar el pedido creado.');
      return OrderPrismaMapper.toDomain(persisted);
    });
  }

  save(
    entity: Pedido,
    expectedVersion: number,
    audit: OrderAuditDraft,
    options?: OrderSaveOptions,
  ) {
    if (!entity.id) throw new Error('No se puede actualizar un pedido sin id.');

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.pedido.updateMany({
        where: { id: entity.id!, version: expectedVersion },
        data: {
          clienteId: entity.clienteId,
          vendedorId: entity.vendedorId,
          visitaId: entity.visitaId,
          estado: entity.estado,
          condicionPago: entity.condicionPago,
          estadoPago: entity.estadoPago,
          moneda: entity.moneda,
          subtotal: new Prisma.Decimal(entity.subtotal),
          descuentoTotal: new Prisma.Decimal(entity.descuentoTotal),
          total: new Prisma.Decimal(entity.total),
          observaciones: entity.observaciones,
          validacionSolicitadaEn: entity.validacionSolicitadaEn,
          confirmadoEn: entity.confirmadoEn,
          motivoCancelacion: entity.motivoCancelacion,
          canceladoEn: entity.canceladoEn,
          version: entity.version,
        },
      });

      if (result.count !== 1) {
        throw new OrderConcurrentModificationError({ id: entity.id, expectedVersion });
      }

      if (options?.replaceDetails) {
        await tx.pedidoDetalle.deleteMany({ where: { pedidoId: entity.id } });
        if (entity.detalles.length > 0) {
          await tx.pedidoDetalle.createMany({
            data: entity.detalles.map((detail) => ({
              pedidoId: entity.id!,
              productoId: detail.productoId,
              cantidadSolicitada: detail.cantidadSolicitada,
              cantidadReservada: 0,
              cantidadDespachada: 0,
              cantidadEntregada: 0,
              precioUnitario: new Prisma.Decimal(detail.precioUnitario),
              descuento: new Prisma.Decimal(detail.descuento ?? '0.00'),
              subtotal: new Prisma.Decimal(detail.subtotal ?? '0.00'),
              observaciones: detail.observaciones ?? null,
              version: 0,
            })),
          });
        }
      }

      await this.createEvent(tx, entity.id, audit);
      const persisted = await tx.pedido.findUnique({
        where: { id: entity.id },
        include: ORDER_WITH_DETAILS,
      });
      if (!persisted) throw new Error('No se pudo recargar el pedido actualizado.');
      return OrderPrismaMapper.toDomain(persisted);
    });
  }

  private createEvent(
    tx: Prisma.TransactionClient,
    pedidoId: number,
    audit: OrderAuditDraft,
  ) {
    return tx.pedidoEvento.create({
      data: {
        pedidoId,
        usuarioId: audit.actorId,
        tipo: audit.tipo,
        detalle: audit.detalle ?? null,
        referenciaTipo: audit.referencia?.tipo ?? null,
        referenciaId: audit.referencia?.id ?? null,
      },
    });
  }
}

function formatOrderNumber(id: number): string {
  return `PED-${String(id).padStart(6, '0')}`;
}
