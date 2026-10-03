import { Injectable } from '@nestjs/common';
import {
  CondicionPago,
  Prisma,
  TipoBienServicioFiscal,
} from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { FiscalItemType, InvoiceState } from '../../../billing.types';
import { Invoice } from '../../../domain/entities/invoice.entity';
import {
  BillableQuantityExceededError,
  BillingConcurrentModificationError,
  BillingIdempotencyConflictError,
} from '../../../domain/errors/billing.errors';
import { BillingMoney } from '../../../domain/value-objects/billing-money.vo';
import {
  CreateInvoiceDraftInput,
  InvoiceRepositoryEntry,
  InvoiceRepositoryPort,
} from '../../../domain/ports/invoice.repository.port';

const ACTIVE_INVOICE_STATES = ['BORRADOR', 'LISTA_EMISION', 'EMITIDA'] as const;

@Injectable()
export class InvoicePrismaRepository implements InvoiceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<InvoiceRepositoryEntry | null> {
    const row = await this.prisma.factura.findUnique({
      where: { id },
      include: { detalles: { orderBy: { id: 'asc' } } },
    });
    return row ? this.map(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<InvoiceRepositoryEntry | null> {
    const row = await this.prisma.factura.findUnique({
      where: { claveIdempotencia: key },
      include: { detalles: { orderBy: { id: 'asc' } } },
    });
    return row ? this.map(row) : null;
  }

  async createDraft(input: CreateInvoiceDraftInput): Promise<InvoiceRepositoryEntry> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.factura.findUnique({
              where: { claveIdempotencia: input.claveIdempotencia },
              include: { detalles: { orderBy: { id: 'asc' } } },
            });
            if (existing) return this.map(existing);

            const localOrderConsumed = new Map<number, number>();
            const computed: Array<{
              entregaDetalleId: number;
              pedidoDetalleId: number;
              productoId: number;
              descripcion: string;
              bienOServicio: FiscalItemType;
              unidadMedida: string;
              cantidad: number;
              precioUnitario: string;
              precioBruto: string;
              descuento: string;
              impuestoTotal: string;
              totalLinea: string;
            }> = [];

            for (const line of [...input.lineas].sort(
              (a, b) =>
                a.pedidoDetalleId - b.pedidoDetalleId ||
                a.entregaDetalleId - b.entregaDetalleId,
            )) {
              const alreadyForDelivery = await tx.facturaDetalle.aggregate({
                where: {
                  entregaDetalleId: line.entregaDetalleId,
                  factura: { estado: { in: [...ACTIVE_INVOICE_STATES] } },
                },
                _sum: { cantidad: true },
              });
              const billedDelivery = alreadyForDelivery._sum.cantidad ?? 0;
              const available = line.cantidadEntregada - billedDelivery;
              if (line.cantidad > available) {
                throw new BillableQuantityExceededError({
                  entregaDetalleId: line.entregaDetalleId,
                  cantidadEntregada: line.cantidadEntregada,
                  cantidadYaFacturada: billedDelivery,
                  cantidadDisponible: Math.max(0, available),
                  cantidadSolicitada: line.cantidad,
                });
              }

              const alreadyForOrder = await tx.facturaDetalle.aggregate({
                where: {
                  pedidoDetalleId: line.pedidoDetalleId,
                  factura: { estado: { in: [...ACTIVE_INVOICE_STATES] } },
                },
                _sum: { cantidad: true },
              });
              const billedOrder = alreadyForOrder._sum.cantidad ?? 0;
              const consumedInDraft = localOrderConsumed.get(line.pedidoDetalleId) ?? 0;
              const consumedBefore = billedOrder + consumedInDraft;

              if (
                consumedBefore + line.cantidad >
                line.cantidadSolicitadaPedido
              ) {
                throw new BillableQuantityExceededError({
                  pedidoDetalleId: line.pedidoDetalleId,
                  cantidadSolicitadaPedido: line.cantidadSolicitadaPedido,
                  cantidadYaFacturada: consumedBefore,
                  cantidadSolicitada: line.cantidad,
                });
              }

              const unit = BillingMoney.from(line.precioUnitario);
              const gross = unit.multiply(line.cantidad);
              const discount = BillingMoney.proportional(
                BillingMoney.from(line.descuentoTotalPedido),
                line.cantidadSolicitadaPedido,
                consumedBefore,
                line.cantidad,
              );
              const net = gross.subtract(discount);

              computed.push({
                entregaDetalleId: line.entregaDetalleId,
                pedidoDetalleId: line.pedidoDetalleId,
                productoId: line.productoId,
                descripcion: line.descripcion,
                bienOServicio: line.bienOServicio,
                unidadMedida: line.unidadMedida,
                cantidad: line.cantidad,
                precioUnitario: unit.toString(),
                precioBruto: gross.toString(),
                descuento: discount.toString(),
                impuestoTotal: '0.00',
                totalLinea: net.toString(),
              });
              localOrderConsumed.set(
                line.pedidoDetalleId,
                consumedInDraft + line.cantidad,
              );
            }

            const subtotal = computed.reduce(
              (sum, line) => sum.add(BillingMoney.from(line.precioBruto)),
              BillingMoney.zero(),
            );
            const discountTotal = computed.reduce(
              (sum, line) => sum.add(BillingMoney.from(line.descuento)),
              BillingMoney.zero(),
            );
            const total = computed.reduce(
              (sum, line) => sum.add(BillingMoney.from(line.totalLinea)),
              BillingMoney.zero(),
            );

            const entity = Invoice.create({
              empresaId: input.empresaId,
              clienteId: input.clienteId,
              pedidoId: input.pedidoId,
              creadoPorId: input.creadoPorId,
              condicionPago: input.condicionPago,
              moneda: input.moneda,
              subtotal: subtotal.toString(),
              descuentoTotal: discountTotal.toString(),
              impuestoTotal: '0.00',
              total: total.toString(),
              detalles: computed,
            });

            const created = await tx.factura.create({
              data: {
                empresaId: entity.empresaId,
                clienteId: entity.clienteId,
                pedidoId: entity.pedidoId,
                creadoPorId: entity.creadoPorId,
                estado: 'BORRADOR',
                condicionPago: entity.condicionPago as CondicionPago,
                moneda: entity.moneda,
                subtotal: entity.subtotal,
                descuentoTotal: entity.descuentoTotal,
                impuestoTotal: entity.impuestoTotal,
                total: entity.total,
                claveIdempotencia: input.claveIdempotencia,
                entregas: {
                  create: [...new Set(input.entregaIds)].map((entregaId) => ({
                    entregaId,
                  })),
                },
                detalles: {
                  create: computed.map((line) => ({
                    productoId: line.productoId,
                    pedidoDetalleId: line.pedidoDetalleId,
                    entregaDetalleId: line.entregaDetalleId,
                    descripcion: line.descripcion,
                    bienOServicio:
                      line.bienOServicio as TipoBienServicioFiscal,
                    unidadMedida: line.unidadMedida,
                    cantidad: line.cantidad,
                    precioUnitario: line.precioUnitario,
                    precioBruto: line.precioBruto,
                    descuento: line.descuento,
                    impuestoTotal: line.impuestoTotal,
                    totalLinea: line.totalLinea,
                  })),
                },
                eventos: {
                  create: {
                    usuarioId: input.creadoPorId,
                    tipo: 'CREADA',
                    estado: 'BORRADOR',
                    detalle: 'Factura creada desde entrega confirmada.',
                    claveIdempotencia: `${input.claveIdempotencia}:CREATED`,
                    metadata: {
                      entregaIds: [...new Set(input.entregaIds)],
                    },
                  },
                },
              },
              include: { detalles: { orderBy: { id: 'asc' } } },
            });

            return this.map(created);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isPrismaCode(error, 'P2034') && attempt < 2) continue;

        if (isPrismaCode(error, 'P2002')) {
          const existing = await this.findByIdempotencyKey(
            input.claveIdempotencia,
          );
          if (existing) return existing;
          throw new BillingIdempotencyConflictError();
        }
        throw error;
      }
    }

    throw new BillingConcurrentModificationError();
  }

  async discard(
    id: number,
    actorId: number,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previousEvent = await tx.facturaEvento.findUnique({
        where: { claveIdempotencia: idempotencyKey },
      });
      if (previousEvent) {
        if (previousEvent.facturaId !== id || previousEvent.tipo !== 'DESCARTADA') {
          throw new BillingIdempotencyConflictError({ idempotencyKey });
        }
        return;
      }

      const changed = await tx.factura.updateMany({
        where: {
          id,
          estado: 'BORRADOR',
          version: expectedVersion,
        },
        data: {
          estado: 'DESCARTADA',
          descartadaEn: new Date(),
          motivoDescarte: reason,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new BillingConcurrentModificationError({ facturaId: id });
      }

      await tx.facturaEvento.create({
        data: {
          facturaId: id,
          usuarioId: actorId,
          tipo: 'DESCARTADA',
          estado: 'DESCARTADA',
          detalle: reason,
          claveIdempotencia: idempotencyKey,
        },
      });
    });
  }

  private map(row: {
    id: number;
    empresaId: number;
    clienteId: number;
    pedidoId: number | null;
    creadoPorId: number | null;
    estado: string;
    condicionPago: string | null;
    moneda: string;
    subtotal: { toFixed(digits: number): string };
    descuentoTotal: { toFixed(digits: number): string };
    impuestoTotal: { toFixed(digits: number): string };
    total: { toFixed(digits: number): string };
    version: number;
    emitidaEn: Date | null;
    descartadaEn: Date | null;
    motivoDescarte: string | null;
    detalles: Array<{
      id: number;
      productoId: number;
      pedidoDetalleId: number | null;
      entregaDetalleId: number | null;
      descripcion: string;
      bienOServicio: string;
      unidadMedida: string;
      cantidad: number;
      precioUnitario: { toFixed(digits: number): string };
      precioBruto: { toFixed(digits: number): string };
      descuento: { toFixed(digits: number): string };
      impuestoTotal: { toFixed(digits: number): string };
      totalLinea: { toFixed(digits: number): string };
    }>;
  }): InvoiceRepositoryEntry {
    return {
      id: row.id,
      empresaId: row.empresaId,
      clienteId: row.clienteId,
      pedidoId: row.pedidoId,
      creadoPorId: row.creadoPorId,
      estado: row.estado as InvoiceState,
      condicionPago: row.condicionPago,
      moneda: row.moneda,
      subtotal: row.subtotal.toFixed(2),
      descuentoTotal: row.descuentoTotal.toFixed(2),
      impuestoTotal: row.impuestoTotal.toFixed(2),
      total: row.total.toFixed(2),
      version: row.version,
      emitidaEn: row.emitidaEn,
      descartadaEn: row.descartadaEn,
      motivoDescarte: row.motivoDescarte,
      detalles: row.detalles.map((line) => ({
        id: line.id,
        productoId: line.productoId,
        pedidoDetalleId: line.pedidoDetalleId,
        entregaDetalleId: line.entregaDetalleId,
        descripcion: line.descripcion,
        bienOServicio: line.bienOServicio as FiscalItemType,
        unidadMedida: line.unidadMedida,
        cantidad: line.cantidad,
        precioUnitario: line.precioUnitario.toFixed(2),
        precioBruto: line.precioBruto.toFixed(2),
        descuento: line.descuento.toFixed(2),
        impuestoTotal: line.impuestoTotal.toFixed(2),
        totalLinea: line.totalLinea.toFixed(2),
      })),
    };
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}
