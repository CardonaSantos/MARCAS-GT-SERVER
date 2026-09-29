import { Pedido } from '../domain/entities/order.entity';
import { OrderActorDirectoryPort } from '../domain/ports/order-actor-directory.port';
import { OrderCustomerDirectoryPort } from '../domain/ports/order-customer-directory.port';
import { OrderProductCatalogPort } from '../domain/ports/order-product-catalog.port';
import { OrderRepositoryPort, OrderSaveOptions } from '../domain/ports/order.repository.port';
import { OrderVisitDirectoryPort } from '../domain/ports/order-visit-directory.port';
import { OrderActorEntry, OrderAuditDraft } from '../order.types';

export class FakeOrderRepository implements OrderRepositoryPort {
  entity: Pedido | null = null;
  events: OrderAuditDraft[] = [];
  saveOptions: OrderSaveOptions | undefined;

  findById(_id: number) { return Promise.resolve(this.entity); }
  create(entity: Pedido, audit: OrderAuditDraft) {
    this.entity = entity;
    this.events.push(audit);
    return Promise.resolve(entity);
  }
  save(entity: Pedido, _expectedVersion: number, audit: OrderAuditDraft, options?: OrderSaveOptions) {
    this.entity = entity;
    this.events.push(audit);
    this.saveOptions = options;
    return Promise.resolve(entity);
  }
}

export class FakeOrderActorDirectory implements OrderActorDirectoryPort {
  users = new Map<number, OrderActorEntry>();
  findById(id: number) { return Promise.resolve(this.users.get(id) ?? null); }
}

export class FakeOrderCustomerDirectory implements OrderCustomerDirectoryPort {
  ids = new Set<number>();
  findById(id: number) {
    if (!this.ids.has(id)) return Promise.resolve(null);
    return Promise.resolve({
      id,
      nombre: `Cliente ${id}`,
      apellido: null,
      telefono: '00000000',
      correo: null,
      direccion: 'Dirección',
    });
  }
}

export class FakeOrderVisitDirectory implements OrderVisitDirectoryPort {
  rows = new Map<number, any>();
  findById(id: number) { return Promise.resolve(this.rows.get(id) ?? null); }
}

export class FakeOrderProductCatalog implements OrderProductCatalogPort {
  rows = new Map<number, any>();
  findByIds(ids: number[]) {
    return Promise.resolve(ids.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [row] : [];
    }));
  }
}

export function adminActor(id = 3): OrderActorEntry {
  return {
    id,
    nombre: 'Admin',
    correo: 'admin@test.com',
    rol: 'ADMIN',
    activo: true,
    empresaId: 1,
  };
}

export function sellerActor(id = 7): OrderActorEntry {
  return {
    id,
    nombre: 'Vendedor',
    correo: 'vendedor@test.com',
    rol: 'VENDEDOR',
    activo: true,
    empresaId: 1,
  };
}

export function draftOrder(overrides: Record<string, unknown> = {}) {
  return Pedido.create({
    empresaId: 1,
    clienteId: 10,
    vendedorId: 7,
    condicionPago: 'PREPAGO',
    detalles: [
      {
        productoId: 100,
        cantidadSolicitada: 2,
        precioUnitario: '25.00',
        descuento: '5.00',
      },
    ],
    ...(overrides as any),
  });
}
