import { CreditOrderIntegrationService } from './credit-decision.commands';
import {
  FakeIntegrations,
  FakeOrderCreditGate,
} from '../../testing/credit.fakes';

describe('CreditOrderIntegrationService', () => {
  it('marca FALLIDA y permite retry seguro cuando Pedido falla', async () => {
    const integrations = new FakeIntegrations();
    integrations.operation = {
      id: 10,
      solicitudId: 1,
      pedidoId: 2,
      empresaId: 1,
      actorId: 8,
      tipo: 'APROBACION',
      estado: 'PENDIENTE',
      intentos: 0,
      reason: null,
    };
    const gate = new FakeOrderCreditGate();
    gate.fail = true;
    const service = new CreditOrderIntegrationService(integrations, gate);
    const result = await service.apply(1, 8);
    expect(result.applied).toBe(false);
    expect(integrations.failed).toBe(1);

    gate.fail = false;
    const retry = await service.apply(1, 8);
    expect(retry.applied).toBe(true);
    expect(integrations.applied).toBe(1);
    expect(integrations.operation?.estado).toBe('APLICADA');
  });
});
