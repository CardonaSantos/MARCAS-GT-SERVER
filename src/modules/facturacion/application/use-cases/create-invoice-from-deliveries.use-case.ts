import {
  DeliveryDirectoryPort,
} from '../../../entregas';
import {
  OrderBillingDirectoryPort,
} from '../../../pedidos';
import {
  BillingDeliveryNotBillableError,
  BillingMixedContextError,
  BillingValidationError,
} from '../../domain/errors/billing.errors';
import { InvoiceRepositoryPort } from '../../domain/ports/invoice.repository.port';
import { CreateInvoiceCommand } from '../models/billing.models';
import { BillingActorDirectoryPort } from '../ports/billing-actor-directory.port';
import { BillingProductDirectoryPort } from '../ports/billing-product-directory.port';
import {
  assertBillingOperator,
  assertPositiveInteger,
  requireBillingActor,
} from './billing.helpers';

export class CreateInvoiceFromDeliveriesUseCase {
  constructor(
    private readonly invoices: InvoiceRepositoryPort,
    private readonly actors: BillingActorDirectoryPort,
    private readonly deliveries: DeliveryDirectoryPort,
    private readonly orders: OrderBillingDirectoryPort,
    private readonly products: BillingProductDirectoryPort,
  ) {}

  async execute(command: CreateInvoiceCommand) {
    const actor = await requireBillingActor(this.actors, command.actorId);
    assertBillingOperator(actor);

    const key = command.claveIdempotencia.trim();
    if (key.length < 8) {
      throw new BillingValidationError(
        'La clave de idempotencia debe contener al menos 8 caracteres.',
      );
    }

    const existing = await this.invoices.findByIdempotencyKey(key);
    if (existing) {
      if (existing.empresaId !== actor.empresaId) {
        throw new BillingValidationError(
          'La clave de idempotencia pertenece a otra empresa.',
        );
      }
      return existing;
    }

    const deliveryIds = [...new Set(command.entregaIds)];
    if (!deliveryIds.length) {
      throw new BillingValidationError('Debe seleccionar al menos una entrega.');
    }
    deliveryIds.forEach((id) => assertPositiveInteger(id, 'entregaId'));

    if (!command.lineas.length) {
      throw new BillingValidationError('Debe seleccionar al menos una línea para facturar.');
    }

    const requestedByDetail = new Map<number, number>();
    for (const line of command.lineas) {
      assertPositiveInteger(line.entregaDetalleId, 'entregaDetalleId');
      assertPositiveInteger(line.cantidad, 'cantidad');
      if (requestedByDetail.has(line.entregaDetalleId)) {
        throw new BillingValidationError('No se puede repetir un detalle de entrega.', {
          entregaDetalleId: line.entregaDetalleId,
        });
      }
      requestedByDetail.set(line.entregaDetalleId, line.cantidad);
    }

    const deliveryRows = await Promise.all(
      deliveryIds.map((id) => this.deliveries.findBillableById(id)),
    );
    if (deliveryRows.some((row) => !row)) {
      const index = deliveryRows.findIndex((row) => !row);
      throw new BillingDeliveryNotBillableError(deliveryIds[index]);
    }

    const rows = deliveryRows.filter(
      (row): row is NonNullable<typeof row> => Boolean(row),
    );
    const first = rows[0];

    for (const row of rows) {
      if (
        row.empresaId !== first.empresaId ||
        row.clienteId !== first.clienteId ||
        row.pedidoId !== first.pedidoId
      ) {
        throw new BillingMixedContextError(
          'Las entregas de una misma factura deben pertenecer a la misma empresa, cliente y pedido.',
          { entregaIds: deliveryIds },
        );
      }
      if (row.empresaId !== actor.empresaId) {
        throw new BillingMixedContextError('La entrega pertenece a otra empresa.', {
          entregaId: row.id,
        });
      }
    }

    const order = await this.orders.findForBilling(first.pedidoId);
    if (!order) {
      throw new BillingValidationError('No se encontró el pedido asociado a la entrega.', {
        pedidoId: first.pedidoId,
      });
    }
    if (
      order.empresaId !== first.empresaId ||
      order.clienteId !== first.clienteId
    ) {
      throw new BillingMixedContextError(
        'El pedido no coincide con el contexto de las entregas.',
      );
    }

    const allDetails = rows.flatMap((delivery) =>
      delivery.detalles.map((detail) => ({ delivery, detail })),
    );
    const detailMap = new Map(allDetails.map((item) => [item.detail.id, item]));
    const orderDetailMap = new Map(order.detalles.map((detail) => [detail.id, detail]));

    for (const detailId of requestedByDetail.keys()) {
      if (!detailMap.has(detailId)) {
        throw new BillingValidationError(
          'El detalle solicitado no pertenece a las entregas seleccionadas.',
          { entregaDetalleId: detailId },
        );
      }
    }

    const productIds = [
      ...new Set(
        [...requestedByDetail.keys()].map(
          (detailId) => detailMap.get(detailId)!.detail.productoId,
        ),
      ),
    ];
    const productRows = await this.products.findByIds(productIds);
    const productMap = new Map(productRows.map((product) => [product.id, product]));

    const lines = [...requestedByDetail.entries()].map(
      ([entregaDetalleId, cantidad]) => {
        const item = detailMap.get(entregaDetalleId)!;
        const detail = item.detail;
        const orderDetail = orderDetailMap.get(detail.pedidoDetalleId);
        const product = productMap.get(detail.productoId);

        if (!orderDetail) {
          throw new BillingValidationError(
            'No se encontró el detalle comercial del pedido.',
            { pedidoDetalleId: detail.pedidoDetalleId },
          );
        }
        if (!product) {
          throw new BillingValidationError('No se encontró el producto a facturar.', {
            productoId: detail.productoId,
          });
        }
        if (cantidad > detail.cantidadEntregada) {
          throw new BillingValidationError(
            'La cantidad solicitada supera lo entregado en esta entrega.',
            {
              entregaDetalleId,
              entregada: detail.cantidadEntregada,
              solicitada: cantidad,
            },
          );
        }

        return {
          entregaId: item.delivery.id,
          entregaDetalleId,
          pedidoDetalleId: detail.pedidoDetalleId,
          productoId: detail.productoId,
          cantidad,
          cantidadEntregada: detail.cantidadEntregada,
          cantidadSolicitadaPedido: orderDetail.cantidadSolicitada,
          precioUnitario: orderDetail.precioUnitario,
          descuentoTotalPedido: orderDetail.descuento,
          descripcion:
            product.fiscal?.descripcionFiscal?.trim() ||
            product.descripcion?.trim() ||
            product.nombre,
          bienOServicio: product.fiscal?.bienOServicio ?? 'BIEN',
          unidadMedida: product.fiscal?.unidadMedida?.trim() || 'UN',
        } as const;
      },
    );

    return this.invoices.createDraft({
      empresaId: first.empresaId,
      clienteId: first.clienteId,
      pedidoId: first.pedidoId,
      creadoPorId: actor.id,
      condicionPago: order.condicionPago,
      moneda: order.moneda,
      claveIdempotencia: key,
      entregaIds: deliveryIds,
      lineas: lines,
    });
  }
}
