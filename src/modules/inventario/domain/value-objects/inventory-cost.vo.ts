import { InvalidInventoryCostError } from '../errors/inventory.errors';

const SCALE = 10_000n;

export class InventoryCost {
  private constructor(private readonly scaledValue: bigint) {}

  static zero(): InventoryCost {
    return new InventoryCost(0n);
  }

  static from(value: string | number | null | undefined): InventoryCost {
    if (value === null || value === undefined || value === '') {
      return InventoryCost.zero();
    }

    const raw = String(value).trim();
    if (!/^\d+(?:\.\d{1,4})?$/.test(raw)) {
      throw new InvalidInventoryCostError(value);
    }

    const [integerPart, decimalPart = ''] = raw.split('.');
    const fraction = decimalPart.padEnd(4, '0');
    const scaled = BigInt(integerPart) * SCALE + BigInt(fraction);
    return new InventoryCost(scaled);
  }

  static weightedAverage(
    currentQuantity: number,
    currentCost: InventoryCost,
    incomingQuantity: number,
    incomingCost: InventoryCost,
  ): InventoryCost {
    const totalQuantity = currentQuantity + incomingQuantity;
    if (totalQuantity <= 0) return InventoryCost.zero();

    const weighted =
      currentCost.scaledValue * BigInt(currentQuantity) +
      incomingCost.scaledValue * BigInt(incomingQuantity);

    const divisor = BigInt(totalQuantity);
    const quotient = weighted / divisor;
    const remainder = weighted % divisor;
    const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
    return new InventoryCost(rounded);
  }

  toString(): string {
    const integerPart = this.scaledValue / SCALE;
    const decimalPart = (this.scaledValue % SCALE).toString().padStart(4, '0');
    return `${integerPart}.${decimalPart}`;
  }
}
