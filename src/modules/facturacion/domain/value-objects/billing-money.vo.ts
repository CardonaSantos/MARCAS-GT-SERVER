import { BillingValidationError } from '../errors/billing.errors';

export class BillingMoney {
  private constructor(private readonly cents: number) {}

  static zero(): BillingMoney {
    return new BillingMoney(0);
  }

  static from(value: string | number): BillingMoney {
    const normalized =
      typeof value === 'number' ? value.toFixed(2) : String(value).trim();

    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) {
      throw new BillingValidationError('El monto monetario es inválido.', { value });
    }

    const [whole, fraction = ''] = normalized.split('.');
    const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
    return BillingMoney.fromCents(cents);
  }

  static fromCents(cents: number): BillingMoney {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new BillingValidationError('El monto monetario está fuera de rango.', { cents });
    }
    return new BillingMoney(cents);
  }

  static proportional(
    total: BillingMoney,
    totalQuantity: number,
    consumedBefore: number,
    quantity: number,
  ): BillingMoney {
    if (
      !Number.isInteger(totalQuantity) ||
      !Number.isInteger(consumedBefore) ||
      !Number.isInteger(quantity) ||
      totalQuantity <= 0 ||
      consumedBefore < 0 ||
      quantity < 0 ||
      consumedBefore + quantity > totalQuantity
    ) {
      throw new BillingValidationError('No se puede distribuir el monto con esas cantidades.', {
        totalQuantity,
        consumedBefore,
        quantity,
      });
    }

    const cents = BigInt(total.cents);
    const divisor = BigInt(totalQuantity);
    const round = (q: number) =>
      Number((cents * BigInt(q) + divisor / 2n) / divisor);

    return BillingMoney.fromCents(round(consumedBefore + quantity) - round(consumedBefore));
  }

  add(other: BillingMoney): BillingMoney {
    return BillingMoney.fromCents(this.cents + other.cents);
  }

  subtract(other: BillingMoney): BillingMoney {
    if (other.cents > this.cents) {
      throw new BillingValidationError('El monto a restar supera el total.');
    }
    return BillingMoney.fromCents(this.cents - other.cents);
  }

  multiply(quantity: number): BillingMoney {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new BillingValidationError('La cantidad debe ser un entero no negativo.', { quantity });
    }
    return BillingMoney.fromCents(this.cents * quantity);
  }

  equals(other: BillingMoney): boolean {
    return this.cents === other.cents;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  toCents(): number {
    return this.cents;
  }

  toString(): string {
    return (this.cents / 100).toFixed(2);
  }
}
