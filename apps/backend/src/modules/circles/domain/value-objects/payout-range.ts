import { DomainError } from '../../../../shared/errors/app-error';
import { type ExchangeRates } from '../../../../shared/domain/value-objects/exchange-rates';
import { Money } from '../../../../shared/domain/value-objects/money';

/** Unidades menores de una unidad entera de la moneda (100 en PEN y USD). */
export const minorPerUnit = (currency: string): number =>
  10 **
  (new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2);

/** El salto más cercano de la forma 1, 2 o 5 × 10ⁿ unidades enteras (al menos 1 unidad). */
function roundStep(amount: number, unit: number): number {
  const units = Math.max(1, amount / unit);
  const magnitude = 10 ** Math.floor(Math.log10(units));
  const nearest = [1, 2, 5, 10]
    .map((factor) => factor * magnitude)
    .reduce((best, candidate) =>
      Math.abs(candidate - units) < Math.abs(best - units) ? candidate : best,
    );
  return nearest * unit;
}

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

  /**
   * El rango equivalente en otra moneda (pending-scope M6): el salto convertido se redondea a
   * 1, 2 o 5 por una potencia de 10 unidades enteras, el mínimo sube al salto siguiente y el
   * máximo baja al anterior, así el rango queda dentro del original.
   */
  convertedTo(currency: string, rates: ExchangeRates): PayoutRange {
    if (currency === this.currency) return this;
    const step = roundStep(rates.convert(this.step, currency).amount, minorPerUnit(currency));
    const min = Math.ceil(rates.convert(this.min, currency).amount / step) * step;
    const max = Math.max(min, Math.floor(rates.convert(this.max, currency).amount / step) * step);
    return PayoutRange.create({
      min: Money.of(min, currency),
      max: Money.of(max, currency),
      step: Money.of(step, currency),
    });
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
