import {
  OrderActorNotFoundError,
  OrderCompanyRequiredError,
  OrderCustomerNotFoundError,
  OrderForbiddenError,
  OrderProductNotFoundError,
  OrderSellerInvalidError,
  OrderVisitMismatchError,
  OrderVisitNotFoundError,
} from '../../domain/errors/order.errors';
import { Pedido } from '../../domain/entities/order.entity';
import { OrderActorDirectoryPort } from '../../domain/ports/order-actor-directory.port';
import { OrderCustomerDirectoryPort } from '../../domain/ports/order-customer-directory.port';
import {
  OrderProductCatalogPort,
  OrderProductEntry,
} from '../../domain/ports/order-product-catalog.port';
import { OrderVisitDirectoryPort } from '../../domain/ports/order-visit-directory.port';
import { OrderActorEntry } from '../../order.types';
import { CreateOrderLineInput } from '../models/order.models';

export async function requireOrderActor(
  users: OrderActorDirectoryPort,
  actorId: number,
): Promise<OrderActorEntry & { empresaId: number }> {
  const actor = await users.findById(actorId);
  if (!actor || !actor.activo) throw new OrderActorNotFoundError(actorId);
  if (!actor.empresaId) throw new OrderCompanyRequiredError(actorId);
  return actor as OrderActorEntry & { empresaId: number };
}

export async function resolveOrderSeller(
  users: OrderActorDirectoryPort,
  actor: OrderActorEntry & { empresaId: number },
  requestedSellerId?: number,
): Promise<number> {
  if (actor.rol === 'VENDEDOR') {
    if (requestedSellerId !== undefined && requestedSellerId !== actor.id) {
      throw new OrderForbiddenError(
        'Un vendedor no puede crear o reasignar pedidos a otro vendedor.',
      );
    }
    return actor.id;
  }

  if (actor.rol !== 'ADMIN') {
    throw new OrderForbiddenError('Solo ADMIN o VENDEDOR pueden crear pedidos.');
  }

  const sellerId = requestedSellerId ?? actor.id;
  if (sellerId === actor.id) return actor.id;

  const seller = await users.findById(sellerId);
  if (
    !seller ||
    !seller.activo ||
    seller.empresaId !== actor.empresaId ||
    !['VENDEDOR', 'ADMIN'].includes(seller.rol)
  ) {
    throw new OrderSellerInvalidError(sellerId);
  }

  return seller.id;
}

export function assertOrderWriteAccess(
  actor: OrderActorEntry & { empresaId: number },
  order: Pedido,
): void {
  if (order.empresaId !== actor.empresaId) throw new OrderForbiddenError();
  if (actor.rol === 'ADMIN') return;
  if (actor.rol === 'VENDEDOR' && order.vendedorId === actor.id) return;
  throw new OrderForbiddenError();
}

export function readScopeForActor(
  actor: OrderActorEntry & { empresaId: number },
): { empresaId: number; vendedorId?: number } {
  return {
    empresaId: actor.empresaId,
    ...(actor.rol === 'VENDEDOR' ? { vendedorId: actor.id } : {}),
  };
}

export async function assertOrderCustomer(
  customers: OrderCustomerDirectoryPort,
  clienteId: number,
): Promise<void> {
  if (!(await customers.findById(clienteId))) {
    throw new OrderCustomerNotFoundError(clienteId);
  }
}

export async function assertOrderVisit(
  visits: OrderVisitDirectoryPort,
  visitaId: number | null | undefined,
  clienteId: number,
  vendedorId: number,
): Promise<void> {
  if (visitaId == null) return;
  const visit = await visits.findById(visitaId);
  if (!visit) throw new OrderVisitNotFoundError(visitaId);
  if (visit.clienteId !== clienteId || visit.usuarioId !== vendedorId) {
    throw new OrderVisitMismatchError({
      visitaId,
      clienteId,
      vendedorId,
      visitaClienteId: visit.clienteId,
      visitaVendedorId: visit.usuarioId,
    });
  }
}

export async function buildOrderDetails(
  products: OrderProductCatalogPort,
  lines: CreateOrderLineInput[],
) {
  if (lines.length === 0) return [];
  const ids = [...new Set(lines.map((line) => line.productoId))];
  const catalog = await products.findByIds(ids);
  const byId = new Map<number, OrderProductEntry>(
    catalog.map((product) => [product.id, product]),
  );

  return lines.map((line) => {
    const product = byId.get(line.productoId);
    if (!product) throw new OrderProductNotFoundError(line.productoId);
    return {
      productoId: line.productoId,
      cantidadSolicitada: line.cantidadSolicitada,
      cantidadReservada: 0,
      cantidadDespachada: 0,
      cantidadEntregada: 0,
      precioUnitario: product.precio,
      descuento: line.descuento ?? '0.00',
      observaciones: line.observaciones ?? null,
      version: 0,
    };
  });
}
