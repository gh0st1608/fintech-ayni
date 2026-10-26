import { DomainError } from '@/domain/shared/errors/DomainError';

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';
}

const ISO_4217 = /^[A-Z]{3}$/;

/** Decimales de la moneda según Intl (2 para PEN y USD, 0 para JPY). Valida el formato ISO 4217. */
function fractionDigitsOf(currency: string): number {
  if (!ISO_4217.test(currency)) {
    throw new InvalidMoneyError(`Invalid ISO 4217 currency code: ${currency}`);
  }
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/**
 * Monto inmutable en unidades menores (entero) con su moneda ISO 4217, igual que el backend.
 * La moneda nunca se asume: llega del backend o de la configuración.
 */
export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
    readonly fractionDigits: number,
  ) {}

  static of(amount: number, currency: string): Money {
    const fractionDigits = fractionDigitsOf(currency);
    if (!Number.isSafeInteger(amount)) {
      throw new InvalidMoneyError(`Amount must be an integer in minor units: ${amount}`);
    }
    return new Money(amount, currency, fractionDigits);
  }

  static fromMajor(major: number, currency: string): Money {
    return Money.of(Math.round(major * 10 ** fractionDigitsOf(currency)), currency);
  }

  toMajor(): number {
    return this.amount / 10 ** this.fractionDigits;
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchError(`Cannot add ${other.currency} to ${this.currency}`);
    }
    return Money.of(this.amount + other.amount, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toJSON(): { amount: number; currency: string } {
    return { amount: this.amount, currency: this.currency };
  }
}
