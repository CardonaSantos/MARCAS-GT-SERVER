import { CreditMoney } from './credit-money.vo';

describe('CreditMoney', () => {
  it('opera centavos sin Float', () => {
    expect(CreditMoney.from('450.00').subtract(CreditMoney.from('50.00')).toString()).toBe('400.00');
  });
  it('calcula porcentajes redondeados a centavos', () => {
    expect(CreditMoney.from('999.99').multiplyPercent('20.00').toString()).toBe('200.00');
  });
});
