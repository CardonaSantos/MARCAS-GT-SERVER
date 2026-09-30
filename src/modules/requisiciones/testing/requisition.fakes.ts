import { BodegaDirectoryPort } from '../../bodegas';
import { InventoryOperationsPort } from '../../inventario';
import { Requisition } from '../domain/entities/requisition.entity';
import { RequisitionActorDirectoryPort } from '../domain/ports/requisition-actor-directory.port';
import { RequisitionCatalogPort } from '../domain/ports/requisition-catalog.port';
import {
  PreparedReceipt,
  PrepareReceiptCommand,
  RequisitionRepositoryPort,
} from '../domain/ports/requisition.repository.port';
import { RequisitionAuditDraft } from '../domain/requisition.types';

export class FakeRequisitionRepository implements RequisitionRepositoryPort {
  entity: Requisition | null = null;
  audits: RequisitionAuditDraft[] = [];
  receipt: PreparedReceipt | null = null;
  receiptFailed = false;
  receiptFinalized = false;

  async findById(id: number) {
    return this.entity?.id === id ? this.entity : null;
  }

  async create(entity: Requisition, audit: RequisitionAuditDraft) {
    this.entity = Requisition.rehydrate({
      id: 1,
      empresaId: entity.empresaId,
      bodegaDestinoId: entity.bodegaDestinoId,
      proveedorId: entity.proveedorId,
      solicitanteId: entity.solicitanteId,
      estado: entity.estado,
      observaciones: entity.observaciones,
      version: entity.version,
      detalles: entity.detalles.map((detail, index) => ({ ...detail, id: index + 1 })),
    });
    this.audits.push(audit);
    return this.entity;
  }

  async save(entity: Requisition, _expectedVersion: number, audit: RequisitionAuditDraft) {
    this.entity = entity;
    this.audits.push(audit);
    return entity;
  }

  async prepareReceipt(command: PrepareReceiptCommand): Promise<PreparedReceipt> {
    if (this.receipt) return { ...this.receipt, repeated: true };
    if (!this.entity?.proveedorId) throw new Error('Fixture sin proveedor');
    this.receipt = {
      id: 9,
      requisicionId: command.requisicionId,
      bodegaDestinoId: this.entity.bodegaDestinoId,
      proveedorId: this.entity.proveedorId,
      recibidoPorId: command.recibidoPorId,
      estado: 'PENDIENTE',
      claveIdempotencia: command.claveIdempotencia,
      repeated: false,
      detalles: command.detalles.map((line, index) => ({
        id: 100 + index,
        requisicionDetalleId: line.requisicionDetalleId,
        productoId: this.entity!.detalles.find((d) => d.id === line.requisicionDetalleId)!.productoId,
        cantidad: line.cantidad,
        costoUnitario: line.costoUnitario,
      })),
    };
    return this.receipt;
  }

  async markReceiptFailed() { this.receiptFailed = true; }
  async finalizeReceipt() {
    this.receiptFinalized = true;
    if (this.receipt) this.receipt = { ...this.receipt, estado: 'APLICADA' };
  }
}

export class FakeBodegaDirectory implements BodegaDirectoryPort {
  async findById(id: number) { return { id, codigo: 'CENTRAL', nombre: 'Bodega Central', activo: true, esPrincipal: true }; }
  async findPrincipal() { return this.findById(1); }
}

export class FakeRequisitionCatalog implements RequisitionCatalogPort {
  async findProduct(id: number) { return { id, codigo: `P-${id}`, nombre: `Producto ${id}` }; }
  async findProvider(id: number) { return { id, nombre: `Proveedor ${id}`, activo: true }; }
}

export class FakeRequisitionActors implements RequisitionActorDirectoryPort {
  async findById(id: number) {
    return { id, nombre: 'Admin', correo: 'admin@test.com', rol: 'ADMIN' as const, activo: true, empresaId: 1 };
  }
}

export class FakeInventoryOperations implements InventoryOperationsPort {
  receipts: any[] = [];
  async registerReceipt(command: any) {
    this.receipts.push(command);
    return {
      repeated: false,
      stockId: 1,
      movimientoId: this.receipts.length,
      reservaId: null,
      snapshot: { cantidadReal: 10, cantidadReservada: 0, cantidadDisponible: 10, costoPromedio: command.costoUnitario },
    };
  }
  reserve(): any { throw new Error('not implemented'); }
  applyReservation(): any { throw new Error('not implemented'); }
  releaseReservation(): any { throw new Error('not implemented'); }
  cancelReservation(): any { throw new Error('not implemented'); }
  registerReturn(): any { throw new Error('not implemented'); }
  registerTransferOut(): any { throw new Error('not implemented'); }
  registerTransferIn(): any { throw new Error('not implemented'); }
}
