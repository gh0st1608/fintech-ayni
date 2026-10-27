import { DomainError } from '@/domain/shared/errors/DomainError';
import { Money } from '@/domain/shared/value-objects/Money';

export class InvalidPayoutRangeError extends DomainError {
  readonly code = 'INVALID_PAYOUT_RANGE';
}

/**
 * Montos de payout permitidos en un Game'ya: de `min` a `max` en saltos de `step`, medidos
 * desde `min`. Los valores llegan del backend (pending-scope M6); aquí solo se garantizan
 * las invariantes.
 */
export class PayoutRange {
  private constructor(
    readonly min: Money,
    readonly max: Money,
    readonly step: Money,
  ) {}

  static create({ min, max, step }: { min: Money; max: Money; step: Money }): PayoutRange {
    if (min.currency !== max.currency || min.currency !== step.currency) {
      throw new InvalidPayoutRangeError('Payout range amounts must share the same currency');
    }
    if (min.amount <= 0 || step.amount <= 0 || max.amount < min.amount) {
      throw new InvalidPayoutRangeError(
        `Invalid payout range: ${min.amount}-${max.amount} step ${step.amount}`,
      );
    }
    // El máximo efectivo es el último salto alcanzable desde el mínimo.
    const steps = Math.floor((max.amount - min.amount) / step.amount);
    return new PayoutRange(min, Money.of(min.amount + steps * step.amount, min.currency), step);
  }

  get currency(): string {
    return this.min.currency;
  }

  /** Lleva un monto (en unidades menores) al salto más cercano dentro del rango. */
  clamp(amount: number): Money {
    const steps = Math.round((amount - this.min.amount) / this.step.amount);
    const snapped = this.min.amount + steps * this.step.amount;
    return Money.of(Math.min(Math.max(snapped, this.min.amount), this.max.amount), this.currency);
  }

  isValid(amount: Money): boolean {
    return (
      amount.currency === this.currency &&
      amount.amount >= this.min.amount &&
      amount.amount <= this.max.amount &&
      (amount.amount - this.min.amount) % this.step.amount === 0
    );
  }

  /**
   * Rango limitado al máximo que permite el límite mensual del usuario (R5).
   * Devuelve null si el límite no alcanza ni el monto mínimo.
   */
  capTo(limit: Money): PayoutRange | null {
    if (limit.currency !== this.currency) {
      throw new InvalidPayoutRangeError('Payout limit currency does not match the range');
    }
    if (limit.amount < this.min.amount) return null;
    if (limit.amount >= this.max.amount) return this;
    return PayoutRange.create({ min: this.min, max: limit, step: this.step });
  }
}
