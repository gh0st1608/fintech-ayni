import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

/** Plan del programa de ahorro (COPAYNI-32). El id es la clave del nombre en los JSON de idioma. */
export interface SavingPlan {
  id: string;
  target: Money;
  /** Cashback de la duración más larga: el "hasta X extra" del diseño. */
  maxCashback: Money;
}

export interface SavingCatalog {
  /** Del monto menor al mayor. */
  plans: SavingPlan[];
  /** Duraciones ofrecidas, en meses. */
  durations: number[];
}

/** Cotización de un plan a una duración (COPAYNI-33). Los cálculos son del backend. */
export interface SavingQuote {
  planId: string;
  months: number;
  /** La mayor de las cuotas: si el monto no se reparte exacto, las primeras llevan un céntimo más. */
  monthlyInstallment: Money;
  installments: Money[];
  target: Money;
  cashback: Money;
  total: Money;
  /** Mes de la primera cuota (YYYY-MM). */
  startsOn: string;
  /** Mes en que se recibe el total (YYYY-MM). */
  payoutPeriod: string;
}

export class InvalidSavingQuoteError extends DomainError {
  readonly code = 'INVALID_SAVING_QUOTE';
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Una cotización incoherente no se muestra: el payout debe ser posterior al inicio (el Figma
 * tenía las fechas invertidas), las cuotas deben sumar el objetivo y el total incluir el cashback.
 */
export function assertSavingQuote(quote: SavingQuote): SavingQuote {
  const { installments, target, cashback, total, startsOn, payoutPeriod } = quote;
  const fail = (reason: string) => {
    throw new InvalidSavingQuoteError(`Inconsistent saving quote: ${reason}`);
  };
  if (!PERIOD.test(startsOn) || !PERIOD.test(payoutPeriod)) fail('invalid period');
  // Con YYYY-MM el orden alfabético es el cronológico.
  if (payoutPeriod <= startsOn) fail('payout before start');
  if (installments.length !== quote.months) fail('installment count');
  const money = [quote.monthlyInstallment, ...installments, cashback, total];
  if (money.some(({ currency }) => currency !== target.currency)) fail('currency');
  const saved = installments.reduce((sum, installment) => sum + installment.amount, 0);
  if (saved !== target.amount) fail('installments do not add up');
  if (!target.add(cashback).equals(total)) fail('total');
  return quote;
}
