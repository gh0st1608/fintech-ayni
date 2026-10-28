import { DomainError } from '../../../../shared/errors/app-error';
import { type Money } from '../../../../shared/domain/value-objects/money';

export class InvalidPayoutRangeError extends DomainError {
  constructor(message: string) {
    super('INVALID_PAYOUT_RANGE', message);
  }
}

/**
 * Rango del payout de un Game'ya: de `min` a `max` en saltos de `step`, contados desde `min`
 * (docs/api/circles.md). `max` debe ser alcanzable con saltos enteros.
 */
export class PayoutRange {
  private constructor(
    readonly min: Money,
    readonly max: Money,
    readonly step: Money,
  ) {}

  static create({ min, max, step }: { min: Money; max: Money; step: Money }): PayoutRange {
    if (!min.hasSameCurrency(max) || !min.hasSameCurrency(step)) {
      throw new InvalidPayoutRangeError('Mínimo, máximo y salto deben estar en la misma moneda');
    }
    if (!min.isPositive() || !step.isPositive()) {
      throw new InvalidPayoutRangeError('El mínimo y el salto deben ser positivos');
    }
    if (max.amount < min.amount) {
      throw new InvalidPayoutRangeError('El máximo no puede ser menor que el mínimo');
    }
    if ((max.amount - min.amount) % step.amount !== 0) {
      throw new InvalidPayoutRangeError('El máximo debe alcanzarse con saltos completos');
    }
    return new PayoutRange(min, max, step);
  }

  get currency(): string {
    return this.min.currency;
  }

  /** Si `amount` está en el rango y cae en un salto completo desde `min`. */
  contains(amount: Money): boolean {
    return (
      amount.currency === this.currency &&
      amount.amount >= this.min.amount &&
      amount.amount <= this.max.amount &&
      (amount.amount - this.min.amount) % this.step.amount === 0
    );
  }
}
