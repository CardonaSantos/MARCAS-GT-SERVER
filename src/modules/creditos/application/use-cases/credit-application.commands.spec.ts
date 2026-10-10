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


  it('solicita un crédito MIXTO con anticipo y mantiene el total solicitado del pedido', async () => {
    const apps = new FakeApplications();
    const decisions = new FakeDecisions();
    const integrations = new FakeIntegrations();
    const policies = new FakePolicies();
    const actors = new FakeCreditActors();
    const orders = new FakeOrders();
    const gate = new FakeOrderCreditGate();
    actors.rows.set(7, sellerActor(7));
    orders.rows.set(2, orderEntry({ condicionPago: 'MIXTO' }));
    const commands = new CreditApplicationCommands(
      apps, decisions, integrations, policies, actors, orders,
      new CreditOrderIntegrationService(integrations, gate),
    );

    const result = await commands.requestFromOrder({
      pedidoId: 2,
      plazoDias: 30,
      anticipoPropuesto: '100.00',
      actorId: 7,
    });

    expect(result.estado).toBe('EN_REVISION');
    expect(result.montoSolicitado).toBe('450.00');
    expect(result.anticipoPropuesto).toBe('100.00');
  });

  it.each(['0.00', '450.00', '500.00'])(
    'rechaza anticipo MIXTO fuera del intervalo (0, total): %s',
    async (anticipoPropuesto) => {
      const apps = new FakeApplications();
      const decisions = new FakeDecisions();
      const integrations = new FakeIntegrations();
      const policies = new FakePolicies();
      const actors = new FakeCreditActors();
      const orders = new FakeOrders();
      const gate = new FakeOrderCreditGate();
      actors.rows.set(7, sellerActor(7));
      orders.rows.set(2, orderEntry({ condicionPago: 'MIXTO' }));
      const commands = new CreditApplicationCommands(
        apps, decisions, integrations, policies, actors, orders,
        new CreditOrderIntegrationService(integrations, gate),
      );
      await expect(commands.requestFromOrder({
        pedidoId: 2, plazoDias: 30, anticipoPropuesto, actorId: 7,
      })).rejects.toMatchObject({ code: 'CREDIT_VALIDATION_ERROR' });
      expect(apps.entity).toBeNull();
    },
  );

  it('conserva anticipo cero en el flujo de crédito puro', async () => {
    const apps = new FakeApplications();
    const integrations = new FakeIntegrations();
    const actors = new FakeCreditActors();
    const orders = new FakeOrders();
    actors.rows.set(7, sellerActor(7));
    orders.rows.set(2, orderEntry());
    const commands = new CreditApplicationCommands(
      apps, new FakeDecisions(), integrations, new FakePolicies(), actors, orders,
      new CreditOrderIntegrationService(integrations, new FakeOrderCreditGate()),
    );
    const created = await commands.requestFromOrder({
      pedidoId: 2, plazoDias: 30, actorId: 7,
    });
    expect(created.anticipoPropuesto).toBe('0.00');
    expect(created.estado).toBe('EN_REVISION');
  });

});
