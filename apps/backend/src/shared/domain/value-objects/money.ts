import { DomainError } from '../../errors/app-error';

const CURRENCY_CODE = /^[A-Z]{3}$/;

export class InvalidMoneyError extends DomainError {
  constructor(message: string) {
    super('INVALID_MONEY', message);
  }
}

/**
 * Monto en unidades menores (céntimos) con su moneda ISO 4217 (COPAYNI-17).
 * Enteros para evitar errores de coma flotante; la moneda nunca se asume.
 */
export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  static of(amount: number, currency: string): Money {
    if (!Number.isSafeInteger(amount)) {
      throw new InvalidMoneyError('El monto debe ser un entero en unidades menores');
    }
    if (!CURRENCY_CODE.test(currency)) {
      throw new InvalidMoneyError('La moneda debe ser un código ISO 4217');
    }
    return new Money(amount, currency);
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  hasSameCurrency(other: Money): boolean {
    return this.currency === other.currency;
  }

  equals(other: Money): boolean {
    return this.hasSameCurrency(other) && this.amount === other.amount;
  }
}
