import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

import type { SlotType } from './value-objects/Slot';

/** Sin National ID válido no se puede unir (requisito del "Central Bank"; KYC en COPAYNI-47). */
export class NationalIdRequiredError extends DomainError {
  readonly code = 'NATIONAL_ID_REQUIRED';
}

/** Las cuotas del slot superan el límite mensual de pay-in del Perfil (R5). */
export class MonthlyLimitExceededError extends DomainError {
  readonly code = 'MONTHLY_LIMIT_EXCEEDED';
}

/** Falta el método de cobro, o el elegido ya no está disponible. */
export class PayoutMethodRequiredError extends DomainError {
  readonly code = 'PAYOUT_METHOD_REQUIRED';
}

/** El payout supera el límite del método de cobro (p. ej. la tarjeta prepago). */
export class PayoutMethodLimitExceededError extends DomainError {
  readonly code = 'PAYOUT_METHOD_LIMIT_EXCEEDED';
}

/**
 * Fue expulsado de un círculo por impago y todavía no pagó lo vencido más el cargo por mora
 * (COPAYNI-57). `amountDue` es `null` si el backend no lo informó.
 */
export class MemberBlockedError extends DomainError {
  readonly code = 'MEMBER_BLOCKED';

  constructor(
    message: string,
    readonly amountDue: Money | null,
  ) {
    super(message);
  }
}

/** Lo que se envía para unirse: el círculo ofrecido (o `null`, uno nuevo) y el slot. */
export interface JoinCircleRequest {
  circleId: string | null;
  payout: Money;
  months: number;
  position: number;
}

/** Unión confirmada por el backend (POST /v1/circles/join). */
export interface JoinedCircle {
  circleId: string;
  /** Mes de inicio del círculo (YYYY-MM). */
  startsOn: string;
  payout: Money;
  months: number;
  position: number;
  /** Mes de cobro (YYYY-MM). */
  payoutPeriod: string;
  type: SlotType;
  /** Una cuota por mes del círculo, en orden. */
  installments: Money[];
  /** Lo que recibe en su mes de cobro. */
  netPayout: Money;
  /** Puesta al día incluida en las cuotas al tomar una vacante (COPAYNI-59); cero si no. */
  catchUp: Money;
  /** false: era un reintento de una unión ya hecha. */
  created: boolean;
}

/**
 * La primera cuota a pagar y su mes (YYYY-MM). Quien toma una vacante no paga los meses
 * anteriores a su ingreso: sus cuotas empiezan en cero.
 */
export function firstInstallmentOf(
  circle: Pick<JoinedCircle, 'installments' | 'startsOn'>,
): { amount: Money; period: string } | null {
  const index = circle.installments.findIndex((installment) => installment.amount > 0);
  if (index < 0) return null;
  const [year, month] = circle.startsOn.split('-').map(Number);
  const total = year! * 12 + (month! - 1) + index;
  const period = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  return { amount: circle.installments[index]!, period };
}
