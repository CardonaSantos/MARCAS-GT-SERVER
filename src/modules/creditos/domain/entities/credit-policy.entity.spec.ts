import { CreditPolicy } from './credit-policy.entity';

describe('CreditPolicy', () => {
  it('normaliza requisitos y valida porcentaje', () => {
    const policy = CreditPolicy.create({
      empresaId: 1,
      nombre: 'Crédito 30 días',
      montoMaximo: '5000.00',
      plazoMaximoDias: 30,
      porcentajeAnticipo: '20',
      requisitos: [{ codigo: 'dpi', nombre: 'DPI' }],
    });
    expect(policy.porcentajeAnticipo).toBe('20.00');
    expect(policy.requisitos[0].codigo).toBe('DPI');
  });
});
