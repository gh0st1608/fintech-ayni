import { type Money } from '../../../../shared/domain/value-objects/money';
import { DomainError } from '../../../../shared/errors/app-error';

export class NationalIdRequiredError extends DomainError {
  constructor() {
    super('NATIONAL_ID_REQUIRED', 'Verifica tu National ID antes de unirte a un círculo');
  }
}

export class MonthlyLimitExceededError extends DomainError {
  constructor() {
    super('MONTHLY_LIMIT_EXCEEDED', 'Las cuotas de ese slot superan tu límite mensual de pay-in');
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
  /** Método de cobro elegido y todavía disponible, con su límite por payout; `null` si no hay. */
  readonly payoutMethod: { readonly type: string; readonly limit: Money | null } | null;
}

/**
 * Requisitos visibles en el diseño para unirse a un Game'ya (COPAYNI-31), en el orden en que la
 * app los resuelve: National ID, límite mensual y método de cobro.
 *
 * Supuesto provisional (pending-scope R5): el límite se compara con cada cuota del slot elegido,
 * sin sumar las de otros círculos del usuario.
 */
export function assertCanJoin(
  applicant: JoinApplicant,
  payout: Money,
  installments: readonly Money[],
): void {
  if (!applicant.identityVerified) throw new NationalIdRequiredError();
  const limit = applicant.monthlyPayInLimit;
  if (limit && installments.some((installment) => installment.subtract(limit).isPositive())) {
    throw new MonthlyLimitExceededError();
  }
  const method = applicant.payoutMethod;
  if (!method) throw new PayoutMethodRequiredError();
  if (method.limit && payout.subtract(method.limit).isPositive()) {
    throw new PayoutMethodLimitExceededError();
  }
}
