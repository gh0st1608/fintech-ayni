import { DomainError } from '../../errors/app-error';

const CURRENCY_CODE = /^[A-Z]{3}$/;

/** Denominador de las tasas en puntos básicos: 10000 bps = 100 %. */
export const BPS_DENOMINATOR = 10_000;

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

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  hasSameCurrency(other: Money): boolean {
    return this.currency === other.currency;
  }

  equals(other: Money): boolean {
    return this.hasSameCurrency(other) && this.amount === other.amount;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount - other.amount, this.currency);
  }

  /** Multiplica por un entero (p. ej. cuota × meses). */
  times(factor: number): Money {
    if (!Number.isSafeInteger(factor)) {
      throw new InvalidMoneyError('El factor debe ser un entero');
    }
    return Money.of(this.amount * factor, this.currency);
  }

  /**
   * `rateBps × fraction` del monto, redondeado al céntimo más cercano (0,5 hacia arriba).
   * `fraction` como numerador/denominador enteros evita decimales intermedios.
   */
  percentage(rateBps: number, numerator = 1, denominator = 1): Money {
    if (![rateBps, numerator, denominator].every(Number.isSafeInteger) || denominator <= 0) {
      throw new InvalidMoneyError('La tasa y la fracción deben ser enteros');
    }
    const total = BigInt(this.amount) * BigInt(rateBps) * BigInt(numerator);
    const divisor = BigInt(BPS_DENOMINATOR) * BigInt(denominator);
    const rounded = (total * 2n + divisor) / (divisor * 2n);
    return Money.of(Number(rounded), this.currency);
  }

  /**
   * Reparte el monto en `parts` partes iguales que suman exactamente el total: el resto de
   * la división va, de a un céntimo, a las primeras partes.
   */
  allocate(parts: number): Money[] {
    if (!Number.isSafeInteger(parts) || parts <= 0) {
      throw new InvalidMoneyError('Las partes deben ser un entero positivo');
    }
    const sign = this.amount < 0 ? -1 : 1;
    const absolute = Math.abs(this.amount);
    const base = Math.floor(absolute / parts);
    const remainder = absolute % parts;
    return Array.from({ length: parts }, (_, index) =>
      Money.of(sign * (base + (index < remainder ? 1 : 0)), this.currency),
    );
  }

  private assertSameCurrency(other: Money): void {
    if (!this.hasSameCurrency(other)) {
      throw new InvalidMoneyError('No se pueden operar montos de monedas distintas');
    }
  }
}
