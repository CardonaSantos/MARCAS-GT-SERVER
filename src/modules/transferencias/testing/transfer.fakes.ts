import { BodegaDirectoryPort } from '../../bodegas';
import {
  InventoryAvailabilityPort,
  InventoryOperationsPort,
} from '../../inventario';
import { TransferDirectoryPort } from '../application/ports/transfer-directory.port';
import {
  FinalizeTransferOperationResult,
  PreparedTransferOperation,
  PrepareTransferOperationCommand,
  RegisterTransferOperationLineResultCommand,
  TransferOperationRepositoryPort,
} from '../application/ports/transfer-operation.repository.port';
import { TransferenciaBodega } from '../domain/entities/transfer.entity';
import { TransferActorDirectoryPort } from '../domain/ports/transfer-actor-directory.port';
import { TransferRepositoryPort } from '../domain/ports/transfer.repository.port';
import { TransferAuditDraft } from '../transfer.types';

export class FakeTransferRepository implements TransferRepositoryPort {
  entity: TransferenciaBodega | null = null;
  audits: TransferAuditDraft[] = [];

  async findById(id: number) {
    return this.entity?.id === id ? this.entity : null;
  }

  async create(
    entity: TransferenciaBodega,
    audit: TransferAuditDraft,
  ) {
    this.entity = TransferenciaBodega.rehydrate({
      id: 1,
      bodegaOrigenId: entity.bodegaOrigenId,
      bodegaDestinoId: entity.bodegaDestinoId,
      creadoPorId: entity.creadoPorId,
      estado: entity.estado,
      observaciones: entity.observaciones,
      version: entity.version,
      detalles: entity.detalles.map((detail, index) => ({
        ...detail,
        id: index + 1,
      })),
    });
    this.audits.push(audit);
    return this.entity;
  }

  async save(
    entity: TransferenciaBodega,
    _expectedVersion: number,
    audit: TransferAuditDraft,
  ) {
    this.entity = entity;
    this.audits.push(audit);
    return entity;
  }
}

export class FakeTransferActors implements TransferActorDirectoryPort {
  active = true;

  async findById(id: number) {
    return {
      id,
      nombre: 'Admin',
      correo: 'admin@test.com',
      rol: 'ADMIN' as const,
      activo: this.active,
      empresaId: 1,
    };
  }
}

export class FakeTransferBodegas implements BodegaDirectoryPort {
  inactive = new Set<number>();

  async findById(id: number) {
    return {
      id,
      codigo: `B-${id}`,
      nombre: `Bodega ${id}`,
      activo: !this.inactive.has(id),
      esPrincipal: id === 1,
    };
  }

  async findPrincipal() {
    return this.findById(1);
  }
}

export class FakeInventoryAvailability
  implements InventoryAvailabilityPort
{
  available = true;
  missingProducts = new Set<number>();

  async getProductAvailability(productoId: number) {
    if (this.missingProducts.has(productoId)) return null;
    return {
      producto: {
        id: productoId,
        codigo: `P-${productoId}`,
        nombre: `Producto ${productoId}`,
      },
      totales: {
        real: 100,
        reservado: 0,
        disponible: 100,
      },
      bodegas: [],
    };
  }

  async hasAvailability(
    _bodegaId: number,
    _productoId: number,
    _cantidad: number,
  ) {
    return this.available;
  }
}

export class FakeTransferOperationsRepository
  implements TransferOperationRepositoryPort
{
  prepared: PreparedTransferOperation | null = null;
  finalized: FinalizeTransferOperationResult | null = null;
  failed = false;
  lineResults: RegisterTransferOperationLineResultCommand[] = [];
  unresolvedOperations = false;

  async hasUnresolvedOperations() {
    return this.unresolvedOperations;
  }

  async prepareOperation(
    _command: PrepareTransferOperationCommand,
  ): Promise<PreparedTransferOperation> {
    if (!this.prepared) {
      throw new Error('Fixture de operación no configurado.');
    }
    return this.prepared;
  }

  async registerLineResult(
    command: RegisterTransferOperationLineResultCommand,
  ) {
    this.lineResults.push(command);
  }

  async markOperationFailed() {
    this.failed = true;
  }

  async finalizeOperation(
    operationId: number,
    _actorId: number,
  ): Promise<FinalizeTransferOperationResult> {
    return (
      this.finalized ?? {
        operacionId: operationId,
        transferenciaId: this.prepared!.transferenciaId,
        estadoOperacion: 'APLICADA',
        estadoTransferencia:
          this.prepared!.tipo === 'SALIDA'
            ? 'EN_TRANSITO'
            : 'RECIBIDA_PARCIAL',
      }
    );
  }
}

export class FakeTransferInventoryOperations
  implements InventoryOperationsPort
{
  outbound: any[] = [];
  inbound: any[] = [];

  async registerTransferOut(command: any) {
    this.outbound.push(command);
    return mutationResult(
      this.outbound.length,
      'TRANSFERENCIA_SALIDA',
      command.cantidad,
      '26.2500',
    );
  }

  async registerTransferIn(command: any) {
    this.inbound.push(command);
    return mutationResult(
      this.inbound.length,
      'TRANSFERENCIA_ENTRADA',
      command.cantidad,
      command.costoUnitario ?? null,
    );
  }

  registerReceipt(): any {
    throw new Error('not implemented');
  }
  reserve(): any {
    throw new Error('not implemented');
  }
  applyReservation(): any {
    throw new Error('not implemented');
  }
  releaseReservation(): any {
    throw new Error('not implemented');
  }
  cancelReservation(): any {
    throw new Error('not implemented');
  }
  registerReturn(): any {
    throw new Error('not implemented');
  }
}

export class FakeTransferDirectory implements TransferDirectoryPort {
  entry: any = null;

  async findById(id: number) {
    return this.entry?.id === id ? this.entry : null;
  }
}

function mutationResult(
  movimientoId: number,
  tipo: 'TRANSFERENCIA_SALIDA' | 'TRANSFERENCIA_ENTRADA',
  cantidad: number,
  costoUnitario: string | null,
) {
  return {
    repeated: false,
    stockId: 1,
    movimientoId,
    reservaId: null,
    movimiento: {
      tipo,
      cantidad,
      costoUnitario,
      costoPromedioAntes: '26.2500',
      costoPromedioDespues: '26.2500',
      cantidadRealAntes: 100,
      cantidadRealDespues:
        tipo === 'TRANSFERENCIA_SALIDA'
          ? 100 - cantidad
          : 100 + cantidad,
      reservadaAntes: 0,
      reservadaDespues: 0,
    },
    snapshot: {
      cantidadReal: 100,
      cantidadReservada: 0,
      cantidadDisponible: 100,
      costoPromedio: '26.2500',
    },
  };
}
