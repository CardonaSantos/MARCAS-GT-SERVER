import { PaymentMoney } from './payment-money.vo';

describe('PaymentMoney', () => {
  it('normaliza a dos decimales', () => {
    expect(PaymentMoney.from('10').toString()).toBe('10.00');
    expect(PaymentMoney.from('10.5').toString()).toBe('10.50');
  });

  it('suma y resta sin usar coma flotante', () => {
    expect(
      PaymentMoney.from('0.10')
        .add(PaymentMoney.from('0.20'))
        .toString(),
    ).toBe('0.30');

    expect(
      PaymentMoney.from('100.00')
        .subtract(PaymentMoney.from('33.33'))
        .toString(),
    ).toBe('66.67');
  });
});
