import { CreditApplicationCommands } from './credit-application.commands';
import { CreditOrderIntegrationService } from './credit-decision.commands';
import {
  FakeApplications,
  FakeCreditActors,
  FakeDecisions,
  FakeIntegrations,
  FakeOrderCreditGate,
  FakeOrders,
  FakePolicies,
  orderEntry,
  sellerActor,
} from '../../testing/credit.fakes';

describe('CreditApplicationCommands', () => {
  it('crea solicitud derivando empresa, cliente y vendedor desde Pedido/actor', async () => {
    const apps = new FakeApplications();
    const decisions = new FakeDecisions();
    const integrations = new FakeIntegrations();
    const policies = new FakePolicies();
    const actors = new FakeCreditActors();
    const orders = new FakeOrders();
    const gate = new FakeOrderCreditGate();
    actors.rows.set(7, sellerActor(7));
    orders.rows.set(2, orderEntry());
    const command = new CreditApplicationCommands(
      apps,
      decisions,
      integrations,
      policies,
      actors,
      orders,
      new CreditOrderIntegrationService(integrations, gate),
    );

    const result = await command.create({
      pedidoId: 2,
      montoSolicitado: '450.00',
      plazoDias: 30,
      actorId: 7,
    });

    expect(result.empresaId).toBe(1);
    expect(result.clienteId).toBe(1);
    expect(result.solicitanteId).toBe(7);
    expect(apps.events[0].tipo).toBe('CREADA');
  });
  it('exige anticipo en pedidos MIXTO', async () => {
    const apps = new FakeApplications();
    const decisions = new FakeDecisions();
    const integrations = new FakeIntegrations();
    const policies = new FakePolicies();
    const actors = new FakeCreditActors();
    const orders = new FakeOrders();
    const gate = new FakeOrderCreditGate();
    actors.rows.set(7, sellerActor(7));
    orders.rows.set(2, orderEntry({ condicionPago: 'MIXTO' }));
    const command = new CreditApplicationCommands(
      apps,
      decisions,
      integrations,
      policies,
      actors,
      orders,
      new CreditOrderIntegrationService(integrations, gate),
    );

    await expect(
      command.create({
        pedidoId: 2,
        montoSolicitado: '450.00',
        plazoDias: 30,
        anticipoPropuesto: '0.00',
        actorId: 7,
      }),
    ).rejects.toMatchObject({ code: 'CREDIT_VALIDATION_ERROR' });
  });

});
