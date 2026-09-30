import { OrderValidationError } from '../errors/order.errors';

export class OrderMoney {
  private constructor(private readonly cents: number) {}

  static zero(): OrderMoney {
    return new OrderMoney(0);
  }

  static from(value: string | number): OrderMoney {
    const normalized =
      typeof value === 'number' ? value.toFixed(2) : String(value).trim();

    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) {
      throw new OrderValidationError('El monto monetario es inválido.', { value });
    }

    const [whole, fraction = ''] = normalized.split('.');
    const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));

    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new OrderValidationError('El monto monetario está fuera de rango.', { value });
    }

    return new OrderMoney(cents);
  }

  static fromCents(cents: number): OrderMoney {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new OrderValidationError('El monto monetario está fuera de rango.', { cents });
    }
    return new OrderMoney(cents);
  }

  add(other: OrderMoney): OrderMoney {
    return OrderMoney.fromCents(this.cents + other.cents);
  }

  subtract(other: OrderMoney): OrderMoney {
    if (other.cents > this.cents) {
      throw new OrderValidationError('El descuento no puede superar el monto bruto.');
    }
    return OrderMoney.fromCents(this.cents - other.cents);
  }

  multiply(quantity: number): OrderMoney {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new OrderValidationError('La cantidad monetaria es inválida.', { quantity });
    }
    return OrderMoney.fromCents(this.cents * quantity);
  }

  equals(other: OrderMoney): boolean {
    return this.cents === other.cents;
  }

  toString(): string {
    return (this.cents / 100).toFixed(2);
  }
}
