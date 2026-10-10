import { PaymentValidationError } from '../errors/payment.errors';

export class PaymentMoney {
  private constructor(private readonly cents: bigint) {}

  static zero(): PaymentMoney {
    return new PaymentMoney(0n);
  }

  static from(value: string | number | bigint): PaymentMoney {
    if (typeof value === 'bigint') return new PaymentMoney(value);

    const raw = String(value).trim();
    if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
      throw new PaymentValidationError('El monto debe tener máximo dos decimales.', {
        value,
      });
    }

    const negative = raw.startsWith('-');
    const normalized = negative ? raw.slice(1) : raw;
    const [whole, decimals = ''] = normalized.split('.');
    const cents = BigInt(whole) * 100n + BigInt((decimals + '00').slice(0, 2));
    return new PaymentMoney(negative ? -cents : cents);
  }

  add(other: PaymentMoney): PaymentMoney {
    return new PaymentMoney(this.cents + other.cents);
  }

  subtract(other: PaymentMoney): PaymentMoney {
    return new PaymentMoney(this.cents - other.cents);
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  gte(other: PaymentMoney): boolean {
    return this.cents >= other.cents;
  }

  gt(other: PaymentMoney): boolean {
    return this.cents > other.cents;
  }

  equals(other: PaymentMoney): boolean {
    return this.cents === other.cents;
  }

  toString(): string {
    const negative = this.cents < 0n;
    const abs = negative ? -this.cents : this.cents;
    const whole = abs / 100n;
    const decimals = (abs % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole}.${decimals}`;
  }
}
