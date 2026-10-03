import { BillingValidationError } from '../../domain/errors/billing.errors';
import { BillingMoney } from '../../domain/value-objects/billing-money.vo';

const RATE_SCALE = 10000n;
const HUNDRED = 100n;
const DECIMAL_8_PER_CENT = 1000000n;

export function calculateIncludedTax(
  totalLine: string,
  ratePercent: string,
): {
  base: string;
  tax: string;
  taxRounded: string;
} {
  const total = BillingMoney.from(totalLine);
  const rateScaled = parseRate(ratePercent);
  if (rateScaled === 0n || total.isZero()) {
    return {
      base: toDecimal8(BigInt(total.toCents()) * DECIMAL_8_PER_CENT),
      tax: '0.00000000',
      taxRounded: '0.00',
    };
  }

  const totalScaled = BigInt(total.toCents()) * DECIMAL_8_PER_CENT;
  const hundredScaled = HUNDRED * RATE_SCALE;
  const denominator = hundredScaled + rateScaled;
  const baseScaled =
    (totalScaled * hundredScaled + denominator / 2n) / denominator;
  const taxScaled = totalScaled - baseScaled;
  const taxCents = Number(
    (taxScaled + DECIMAL_8_PER_CENT / 2n) / DECIMAL_8_PER_CENT,
  );

  return {
    base: toDecimal8(baseScaled),
    tax: toDecimal8(taxScaled),
    taxRounded: BillingMoney.fromCents(taxCents).toString(),
  };
}

function parseRate(value: string): bigint {
  const normalized = String(value).trim();
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(normalized)) {
    throw new BillingValidationError('La tasa fiscal es inválida.', { value });
  }
  const [whole, fraction = ''] = normalized.split('.');
  const scaled =
    BigInt(whole) * RATE_SCALE +
    BigInt((fraction + '0000').slice(0, 4));
  if (scaled < 0n || scaled > 100n * RATE_SCALE) {
    throw new BillingValidationError('La tasa fiscal debe estar entre 0 y 100.', {
      value,
    });
  }
  return scaled;
}

function toDecimal8(value: bigint): string {
  const whole = value / 100000000n;
  const fraction = (value % 100000000n).toString().padStart(8, '0');
  return `${whole.toString()}.${fraction}`;
}
