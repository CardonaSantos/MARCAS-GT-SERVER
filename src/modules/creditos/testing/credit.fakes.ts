import { OrderDirectoryEntry, OrderDirectoryPort } from '../../pedidos';
import { CreditApplication } from '../domain/entities/credit-application.entity';
import { CreditActorDirectoryPort } from '../domain/ports/credit-actor-directory.port';
import {
  CreditApplicationRepositoryPort,
  CreditDecisionCommitResult,
  CreditDecisionRepositoryPort,
  CreditEvidenceRepositoryPort,
  CreditIntegrationOperation,
  CreditIntegrationRepositoryPort,
  CreditPolicyEntry,
  CreditPolicyRepositoryPort,
  CreditReadiness,
  CreditRequirementSnapshot,
} from '../domain/ports/credit.repositories';
import { CreditActorEntry, CreditAuditDraft } from '../credit.types';
import { OrderCreditGatePort } from 'src/modules/pedidos/application/ports/order-credit-gate.port';

export class FakeCreditActors implements CreditActorDirectoryPort {
  rows = new Map<number, CreditActorEntry>();
  findById(id: number) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
}

export class FakeOrders implements OrderDirectoryPort {
  rows = new Map<number, OrderDirectoryEntry>();
  findById(id: number) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
}

export class FakeApplications implements CreditApplicationRepositoryPort {
  entity: CreditApplication | null = null;
  createdRequirements: CreditRequirementSnapshot[] = [];
  events: CreditAuditDraft[] = [];
  active: CreditApplication | null = null;
  findById() {
    return Promise.resolve(this.entity);
  }
  findActiveByOrderId() {
    return Promise.resolve(this.active);
  }
  create(
    entity: CreditApplication,
    requirements: CreditRequirementSnapshot[],
    audit: CreditAuditDraft,
  ) {
    this.entity = entity;
    this.createdRequirements = requirements;
    this.events.push(audit);
    return Promise.resolve(entity);
  }
  save(entity: CreditApplication, _expected: number, audit: CreditAuditDraft) {
    this.entity = entity;
    this.events.push(audit);
    return Promise.resolve(entity);
  }
}

export class FakePolicies implements CreditPolicyRepositoryPort {
  rows = new Map<number, CreditPolicyEntry>();
  findPolicyById(id: number) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  createPolicy(): any {
    throw new Error('not used');
  }
  updatePolicy(): any {
    throw new Error('not used');
  }
  setPolicyStatus(): any {
    throw new Error('not used');
  }
}

export class FakeEvidence implements CreditEvidenceRepositoryPort {
  readiness: CreditReadiness = {
    requisitosObligatorios: 0,
    requisitosCumplidos: 0,
    requisitosPendientes: 0,
    requisitosNoCumplidos: 0,
    referencias: 0,
    referenciasPendientes: 0,
    documentos: 0,
    documentosPendientes: 0,
  };
  addReference(): any {
    return Promise.resolve({ id: 1 });
  }
  updateReference(): any {
    return Promise.resolve();
  }
  reviewReference(): any {
    return Promise.resolve();
  }
  addDocument(): any {
    return Promise.resolve({ id: 1 });
  }
  reviewDocument(): any {
    return Promise.resolve();
  }
  reviewRequirement(): any {
    return Promise.resolve();
  }
  getReadiness() {
    return Promise.resolve(this.readiness);
  }
}

export class FakeDecisions implements CreditDecisionRepositoryPort {
  lastApprove: any = null;
  lastReject: any = null;
  result: CreditDecisionCommitResult = {
    repeated: false,
    solicitudId: 1,
    decisionId: 1,
    creditoId: 1,
    decisionType: 'APROBADA',
    integrationOperationId: 1,
    integrationState: 'PENDIENTE',
  };
  approve(input: any) {
    this.lastApprove = input;
    return Promise.resolve(this.result);
  }
  reject(input: any) {
    this.lastReject = input;
    return Promise.resolve({
      ...this.result,
      creditoId: null,
      decisionType: 'RECHAZADA' as const,
    });
  }
  cancel(): any {
    return Promise.resolve({
      ...this.result,
      decisionId: null,
      creditoId: null,
      decisionType: null,
    });
  }
}

export class FakeIntegrations implements CreditIntegrationRepositoryPort {
  blocking: CreditIntegrationOperation | null = null;
  operation: CreditIntegrationOperation | null = null;
  applied = 0;
  failed = 0;
  findByApplicationId() {
    return Promise.resolve(this.operation);
  }
  findBlockingByOrderId() {
    return Promise.resolve(this.blocking);
  }
  markApplied() {
    this.applied += 1;
    if (this.operation)
      this.operation = { ...this.operation, estado: 'APLICADA' };
    return Promise.resolve();
  }
  markFailed() {
    this.failed += 1;
    if (this.operation)
      this.operation = { ...this.operation, estado: 'FALLIDA' };
    return Promise.resolve();
  }
}

export class FakeOrderCreditGate implements OrderCreditGatePort {
  approvals = 0;
  rejections = 0;
  fail = false;
  async confirmApprovedCredit(command: any) {
    this.approvals += 1;
    if (this.fail) throw new Error('gateway failed');
    return {
      repeated: false,
      pedidoId: command.pedidoId,
      estado: 'CONFIRMADO',
    };
  }
  async registerCreditRejection(command: any) {
    this.rejections += 1;
    if (this.fail) throw new Error('gateway failed');
    return { repeated: false, pedidoId: command.pedidoId, estado: 'BORRADOR' };
  }
}

export function adminActor(id = 3): CreditActorEntry {
  return {
    id,
    nombre: 'Admin',
    correo: 'admin@test.com',
    rol: 'ADMIN',
    activo: true,
    empresaId: 1,
  };
}
export function sellerActor(id = 7): CreditActorEntry {
  return {
    id,
    nombre: 'Vendedor',
    correo: 'seller@test.com',
    rol: 'VENDEDOR',
    activo: true,
    empresaId: 1,
  };
}
export function accountingActor(id = 8): CreditActorEntry {
  return {
    id,
    nombre: 'Contabilidad',
    correo: 'accounting@test.com',
    rol: 'CONTABILIDAD',
    activo: true,
    empresaId: 1,
  };
}
export function orderEntry(
  overrides: Partial<OrderDirectoryEntry> = {},
): OrderDirectoryEntry {
  return {
    id: 2,
    numero: 'PED-000002',
    empresaId: 1,
    clienteId: 1,
    vendedorId: 7,
    estado: 'PENDIENTE_VALIDACION',
    condicionPago: 'CREDITO',
    estadoPago: 'PENDIENTE',
    total: '450.00',
    confirmadoEn: null,
    canceladoEn: null,
    detalles: [],
    ...overrides,
  };
}
export function reviewApplication(overrides: Record<string, unknown> = {}) {
  return CreditApplication.rehydrate({
    id: 1,
    numero: 'SOL-000001',
    empresaId: 1,
    pedidoId: 2,
    clienteId: 1,
    solicitanteId: 7,
    politicaId: null,
    creditoId: null,
    montoSolicitado: '450.00',
    plazoDias: 30,
    anticipoPropuesto: '0.00',
    estado: 'EN_REVISION',
    version: 1,
    ...overrides,
  } as any);
}
