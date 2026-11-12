import type { Money } from '@/domain/shared/value-objects/Money';

/**
 * Suscripción a un plan de ahorro (COPAYNI-79, Figma D5 2052:2299). El primer aporte se cobra al
 * confirmar y los siguientes el mismo día de cada mes; el cashback se paga al completar todos.
 */
export type SubscriptionStatus = 'pending' | 'active' | 'completed';

export interface SavingSubscription {
  id: string;
  planId: string;
  months: number;
  /** `pending`: la pasarela todavía no confirma el primer cobro. */
  status: SubscriptionStatus;
  target: Money;
  cashback: Money;
  saved: Money;
  paidContributions: number;
  nextContribution: { sequence: number; dueOn: string; amount: Money } | null;
  /** Mes en que recibe lo ahorrado y el cashback (YYYY-MM). */
  payoutPeriod: string;
  autoDebit: boolean;
  /** "Visa •••• 4242". */
  card: string | null;
}

export interface SubscribeInput {
  planId: string;
  months: number;
  cardId: string;
  autoDebit: boolean;
}
