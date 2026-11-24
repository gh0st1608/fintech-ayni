import { type ExchangeRates } from '../../../../shared/domain/value-objects/exchange-rates';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { DomainError } from '../../../../shared/errors/app-error';
import { monthOverLimit, type MonthlyPayIn } from './monthly-pay-in';

export class NationalIdRequiredError extends DomainError {
  constructor() {
    super('NATIONAL_ID_REQUIRED', 'Verifica tu National ID antes de unirte a un círculo');
  }
}

export class MonthlyLimitExceededError extends DomainError {
  /** Nombra el mes y lo que se pasa: sin eso, la persona no sabe qué ajustar (COPAYNI-110). */
  constructor(month: string, total: Money, excess: Money) {
    super(
      'MONTHLY_LIMIT_EXCEEDED',
      `Tus cuotas de ${month} suman ${total.amount} ${total.currency} y superan tu límite ` +
        `mensual de pay-in en ${excess.amount} ${excess.currency}`,
      {
        month,
        total: String(total.amount),
        excess: String(excess.amount),
        currency: excess.currency,
      },
    );
  }
}

export class PayoutMethodRequiredError extends DomainError {
  constructor() {
    super('PAYOUT_METHOD_REQUIRED', 'Elige cómo recibir tu payout antes de unirte');
  }
}

export class PayoutMethodLimitExceededError extends DomainError {
  constructor() {
    super('PAYOUT_METHOD_LIMIT_EXCEEDED', 'El payout supera el límite de tu método de cobro');
  }
}

/** Lo que se sabe del usuario para decidir si puede unirse. */
export interface JoinApplicant {
  /** National ID válido, requisito del "Central Bank" (Scan National ID). */
  readonly identityVerified: boolean;
  /** Límite mensual de pay-in del Perfil (R5), o `null` si no lo restringe. */
  readonly monthlyPayInLimit: Money | null;
  /** Declaró su ingreso (R5); lo pide el turno Lowest Fees (COPAYNI-60). */
  readonly incomeDeclared: boolean;
  /** Método de cobro elegido y todavía disponible, con su límite por payout; `null` si no hay. */
  readonly payoutMethod: { readonly type: string; readonly limit: Money | null } | null;
}

/**
 * El mismo postulante con sus límites en `currency` (pending-scope M2): se convierten hacia abajo
 * con el tipo de cambio fijo, para que una cuota en otra moneda nunca supere el límite real.
 */
export function applicantIn(
  applicant: JoinApplicant,
  currency: string,
  rates: ExchangeRates,
): JoinApplicant {
  const { monthlyPayInLimit, payoutMethod } = applicant;
  return {
    ...applicant,
    monthlyPayInLimit: monthlyPayInLimit && rates.convert(monthlyPayInLimit, currency, 'down'),
    payoutMethod: payoutMethod && {
      ...payoutMethod,
      limit: payoutMethod.limit && rates.convert(payoutMethod.limit, currency, 'down'),
    },
  };
}

/**
 * Requisitos visibles en el diseño para unirse a un Game'ya (COPAYNI-31), en el orden en que la
 * app los resuelve: National ID, límite mensual y método de cobro.
 *
 * `payIn` es lo que la persona pagaría **cada mes calendario** contando este slot y los círculos
 * en los que ya participa, todo en la moneda del límite. El límite es mensual, así que se compara
 * contra la suma del mes (COPAYNI-110): antes se comparaba contra cada cuota por separado, que
 * coincidía solo porque había una cuota por mes, y en una junta semanal habría dejado
 * comprometerse por cuatro o cinco veces el límite declarado.
 */
export function assertCanJoin(
  applicant: JoinApplicant,
  payout: Money,
  payIn: readonly MonthlyPayIn[],
): void {
  if (!applicant.identityVerified) throw new NationalIdRequiredError();
  const limit = applicant.monthlyPayInLimit;
  const over = limit && monthOverLimit(payIn, limit);
  if (over) {
    throw new MonthlyLimitExceededError(over.period.toString(), over.total, over.excess);
  }
  const method = applicant.payoutMethod;
  if (!method) throw new PayoutMethodRequiredError();
  if (method.limit && payout.subtract(method.limit).isPositive()) {
    throw new PayoutMethodLimitExceededError();
  }
}
