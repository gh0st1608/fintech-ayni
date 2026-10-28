import { type Money } from '../../../../shared/domain/value-objects/money';
import { CircleTerms, MIN_CIRCLE_MONTHS } from '../value-objects/circle-terms';

export interface InstallmentOption {
  months: number;
  /** Cuota base (payout / meses), antes de fees y descuentos del slot. */
  installment: Money;
}

/**
 * Combinaciones cuota × meses para un payout (Monthly Pay-in, 55:9334: 5000×6, 3000×10,
 * 2500×12 para 30.000). Solo se ofrecen duraciones que dan cuotas exactas en céntimos.
 */
export function installmentOptions(
  payout: Money,
  durations: readonly number[],
): InstallmentOption[] {
  return [...new Set(durations)]
    .filter((months) => months >= MIN_CIRCLE_MONTHS && CircleTerms.divides(payout, months))
    .sort((a, b) => a - b)
    .map((months) => ({ months, installment: payout.allocate(months)[0]! }));
}
