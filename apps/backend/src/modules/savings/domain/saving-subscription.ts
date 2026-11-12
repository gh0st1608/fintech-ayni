import { type Money } from '../../../shared/domain/value-objects/money';
import { ConflictError, DomainError } from '../../../shared/errors/app-error';

/**
 * Suscripción a un plan de ahorro (COPAYNI-79, D5). Supuestos aprobados: el primer aporte se cobra
 * al confirmar y los siguientes el mismo día de cada mes; el cashback (R6) se paga al completar
 * todos los aportes. Retirarse antes devuelve lo ahorrado sin cashback (regla a confirmar con el PO).
 */
export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'rejected', 'completed'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const CONTRIBUTION_STATUSES = ['pending', 'paid'] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export interface SavingContribution {
  id: string;
  /** 1 es el primer aporte, que se cobra al confirmar. */
  sequence: number;
  /** `YYYY-MM-DD` en la zona del negocio. */
  dueOn: string;
  amount: Money;
  status: ContributionStatus;
  paidAt: Date | null;
}

export interface SavingSubscription {
  id: string;
  userId: string;
  planId: string;
  months: number;
  target: Money;
  cashback: Money;
  /** `YYYY-MM`: el mes siguiente al último aporte. */
  payoutPeriod: string;
  status: SubscriptionStatus;
  /** Motivo de la pasarela si el primer cobro se rechazó (p. ej. `cc_rejected_insufficient_amount`). */
  rejection: string | null;
  autoDebit: boolean;
  cardId: string;
  createdAt: Date;
  contributions: SavingContribution[];
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Fechas de los aportes: el día de la confirmación en cada mes siguiente. Si el mes es más corto
 * (un 31 en febrero), se usa su último día. `first` es `YYYY-MM-DD`.
 */
export function contributionDates(first: string, months: number): string[] {
  const [year, month, day] = first.split('-').map(Number) as [number, number, number];
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
  });
}

/** El mes en que se recibe lo ahorrado: el siguiente al último aporte. */
export function payoutPeriodAfter(lastDueOn: string): string {
  const [year, month] = lastDueOn.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** El primer cobro se rechazó: la persona no queda suscrita. */
export class SavingPaymentRejectedError extends DomainError {
  constructor(detail: string | null) {
    super(
      'SAVING_PAYMENT_REJECTED',
      'No pudimos cobrar el primer aporte',
      detail ? { detail } : undefined,
    );
  }
}

/** La misma clave de idempotencia ya se usó para otra suscripción distinta. */
export class SubscriptionKeyReusedError extends ConflictError {
  constructor() {
    super('IDEMPOTENCY_KEY_REUSED', 'Esa clave ya se usó para otra suscripción');
  }
}
