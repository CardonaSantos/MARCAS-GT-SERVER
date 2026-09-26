import { InvalidBodegaCodeError } from '../errors/bodega.errors';

export class BodegaCode {
  private constructor(private readonly internalValue: string) {}

  static create(raw: string): BodegaCode {
    const normalized = String(raw ?? '').trim().toUpperCase();

    if (normalized.length < 2 || normalized.length > 30) {
      throw new InvalidBodegaCodeError(
        'El código de bodega debe contener entre 2 y 30 caracteres.',
      );
    }

    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(normalized)) {
      throw new InvalidBodegaCodeError(
        'El código solo puede contener letras, números, guion y guion bajo.',
      );
    }

    return new BodegaCode(normalized);
  }

  get value(): string {
    return this.internalValue;
  }

  equals(other: BodegaCode): boolean {
    return this.internalValue === other.internalValue;
  }

  toString(): string {
    return this.internalValue;
  }
}
