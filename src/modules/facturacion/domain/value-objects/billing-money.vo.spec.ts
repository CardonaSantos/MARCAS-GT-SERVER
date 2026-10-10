import { BillingMoney } from './billing-money.vo';

describe('BillingMoney', () => {
  it('opera montos comerciales sin errores de punto flotante', () => {
    const total = BillingMoney.from('0.10').add(BillingMoney.from('0.20'));
    expect(total.toString()).toBe('0.30');
  });

  it('distribuye descuentos parciales conservando el total', () => {
    const discount = BillingMoney.from('100.00');
    const first = BillingMoney.proportional(discount, 10, 0, 4);
    const second = BillingMoney.proportional(discount, 10, 4, 3);
    const third = BillingMoney.proportional(discount, 10, 7, 3);

    expect(first.toString()).toBe('40.00');
    expect(second.toString()).toBe('30.00');
    expect(third.toString()).toBe('30.00');
    expect(first.add(second).add(third).toString()).toBe('100.00');
  });

  it('absorbe diferencias de centavos de forma determinista', () => {
    const discount = BillingMoney.from('1.00');
    const a = BillingMoney.proportional(discount, 3, 0, 1);
    const b = BillingMoney.proportional(discount, 3, 1, 1);
    const c = BillingMoney.proportional(discount, 3, 2, 1);

    expect(a.add(b).add(c).toString()).toBe('1.00');
  });
});
