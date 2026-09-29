import { CreditDecisionNotReadyError } from '../../domain/errors/credit.errors';
import {
  CreditDecisionCommands,
  CreditOrderIntegrationService,
} from './credit-decision.commands';
import {
  FakeApplications,
  FakeCreditActors,
  FakeDecisions,
  FakeEvidence,
  FakeIntegrations,
  FakeOrderCreditGate,
  FakeOrders,
  FakePolicies,
  accountingActor,
  orderEntry,
  reviewApplication,
} from '../../testing/credit.fakes';

describe('CreditDecisionCommands', () => {
  function setup() {
    const apps = new FakeApplications();
    const evidence = new FakeEvidence();
    const decisions = new FakeDecisions();
    const integrations = new FakeIntegrations();
    const policies = new FakePolicies();
    const actors = new FakeCreditActors();
    const orders = new FakeOrders();
    const gate = new FakeOrderCreditGate();
    apps.entity = reviewApplication();
    actors.rows.set(8, accountingActor(8));
    orders.rows.set(2, orderEntry());
    integrations.operation = {
      id: 1,
      solicitudId: 1,
      pedidoId: 2,
      empresaId: 1,
      actorId: 8,
      tipo: 'APROBACION',
      estado: 'PENDIENTE',
      intentos: 0,
      reason: null,
    };
    const integration = new CreditOrderIntegrationService(integrations, gate);
    const commands = new CreditDecisionCommands(
      apps,
      evidence,
      decisions,
      policies,
      actors,
      orders,
      integration,
    );
    return { commands, evidence, decisions, integrations, gate };
  }

  it('bloquea aprobación con expediente pendiente', async () => {
    const { commands, evidence } = setup();
    evidence.readiness = {
      ...evidence.readiness,
      requisitosObligatorios: 1,
      requisitosPendientes: 1,
    };
    await expect(
      commands.approve({
        id: 1,
        montoAutorizado: '450.00',
        plazoAutorizadoDias: 30,
        anticipoRequerido: '0.00',
        claveIdempotencia: 'approve-test-1',
        actorId: 8,
      }),
    ).rejects.toBeInstanceOf(CreditDecisionNotReadyError);
  });

  it('aprueba y ejecuta integración con Pedido', async () => {
    const { commands, decisions, integrations, gate } = setup();
    const result = await commands.approve({
      id: 1,
      montoAutorizado: '450.00',
      plazoAutorizadoDias: 30,
      anticipoRequerido: '0.00',
      claveIdempotencia: 'approve-test-2',
      actorId: 8,
    });
    expect(decisions.lastApprove.tipo).toBe('APROBADA');
    expect(gate.approvals).toBe(1);
    expect(integrations.applied).toBe(1);
    expect(result.integration.applied).toBe(true);
  });
});
