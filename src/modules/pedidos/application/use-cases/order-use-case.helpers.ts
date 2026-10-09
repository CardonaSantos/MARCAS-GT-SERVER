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

type ActiveOrderActor = OrderActorEntry & {
  empresaId: number;
};

// ============================================================
// ACTOR / USUARIO
// ============================================================

export async function requireOrderActor(
  users: OrderActorDirectoryPort,
  actorId: number,
): Promise<ActiveOrderActor> {
  const actor = await users.findById(actorId);

  if (!actor || !actor.activo) {
    throw new OrderActorNotFoundError(actorId);
  }

  if (!actor.empresaId) {
    throw new OrderCompanyRequiredError(actorId);
  }

  return actor as ActiveOrderActor;
}

// ============================================================
// VENDEDOR ASIGNADO AL PEDIDO
// ============================================================

export async function resolveOrderSeller(
  users: OrderActorDirectoryPort,
  actor: ActiveOrderActor,
  requestedSellerId?: number,
): Promise<number> {
  // El vendedor solo puede asignarse a sí mismo.
  if (actor.rol === 'VENDEDOR') {
    if (requestedSellerId !== undefined && requestedSellerId !== actor.id) {
      throw new OrderForbiddenError(
        'Un vendedor no puede crear o reasignar pedidos a otro vendedor.',
      );
    }

    return actor.id;
  }

  // Conservamos la autorización que agregaste para BODEGA.
  if (!['ADMIN', 'BODEGA'].includes(actor.rol)) {
    throw new OrderForbiddenError(
      'Solo ADMIN, BODEGA o VENDEDOR pueden asignar un responsable al pedido.',
    );
  }

  const sellerId = requestedSellerId ?? actor.id;

  if (sellerId === actor.id) {
    return actor.id;
  }

  const seller = await users.findById(sellerId);

  if (
    !seller ||
    !seller.activo ||
    seller.empresaId !== actor.empresaId ||
    !['VENDEDOR', 'ADMIN', 'BODEGA'].includes(seller.rol)
  ) {
    throw new OrderSellerInvalidError(sellerId);
  }

  return seller.id;
}

// ============================================================
// AUTORIZACIÓN DE ESCRITURA COMERCIAL
// ============================================================

export function assertOrderWriteAccess(
  actor: ActiveOrderActor,
  order: Pedido,
): void {
  if (order.empresaId !== actor.empresaId) {
    throw new OrderForbiddenError();
  }

  if (actor.rol === 'ADMIN' || actor.rol === 'BODEGA') {
    return;
  }

  if (actor.rol === 'VENDEDOR' && order.vendedorId === actor.id) {
    return;
  }

  throw new OrderForbiddenError('No tienes permisos para operar este pedido.');
}

// ============================================================
// AUTORIZACIÓN ESPECÍFICA PARA EDITAR PEDIDOS
// ============================================================

export function assertOrderEditAccess(
  actor: ActiveOrderActor,
  order: Pedido,
): void {
  // La edición conserva el mismo alcance: ADMIN/BODEGA en su empresa,
  // VENDEDOR en pedidos propios. El dominio valida BORRADOR y reservas.
  assertOrderWriteAccess(actor, order);
}

// ============================================================
// ALCANCE DE LECTURA
// ============================================================

export function readScopeForActor(actor: ActiveOrderActor): {
  empresaId: number;
  vendedorId?: number;
} {
  return {
    empresaId: actor.empresaId,
    ...(actor.rol === 'VENDEDOR' ? { vendedorId: actor.id } : {}),
  };
}

// ============================================================
// VALIDACIÓN DE CLIENTE
// ============================================================

export async function assertOrderCustomer(
  customers: OrderCustomerDirectoryPort,
  clienteId: number,
): Promise<void> {
  const customer = await customers.findById(clienteId);

  if (!customer) {
    throw new OrderCustomerNotFoundError(clienteId);
  }
}

// ============================================================
// VALIDACIÓN DE VISITA
// ============================================================

export async function assertOrderVisit(
  visits: OrderVisitDirectoryPort,
  visitaId: number | null | undefined,
  clienteId: number,
  vendedorId: number,
): Promise<void> {
  if (visitaId == null) {
    return;
  }

  const visit = await visits.findById(visitaId);

  if (!visit) {
    throw new OrderVisitNotFoundError(visitaId);
  }

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

// ============================================================
// CONSTRUCCIÓN DE DETALLES DEL PEDIDO
// ============================================================

export async function buildOrderDetails(
  products: OrderProductCatalogPort,
  lines: CreateOrderLineInput[],
) {
  if (lines.length === 0) {
    return [];
  }

  const ids = [...new Set(lines.map((line) => line.productoId))];

  const catalog = await products.findByIds(ids);

  const byId = new Map<number, OrderProductEntry>(
    catalog.map((product) => [product.id, product]),
  );

  return lines.map((line) => {
    const product = byId.get(line.productoId);

    if (!product) {
      throw new OrderProductNotFoundError(line.productoId);
    }

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
