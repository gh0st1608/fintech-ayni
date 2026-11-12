import type { Money } from '../circles/Circle';

/** Vistas de la mora (COPAYNI-94). */
export const DELINQUENCY_VIEWS = ['grace', 'expelled', 'debts', 'refunds'] as const;
export type DelinquencyView = (typeof DELINQUENCY_VIEWS)[number];

export const DELINQUENCY_VIEW_LABELS: Record<DelinquencyView, string> = {
  grace: 'En gracia',
  expelled: 'Expulsados',
  debts: 'Deudas',
  refunds: 'Devoluciones',
};

export interface DelinquencyItem {
  id: string;
  circleId: string;
  /** Nombre enmascarado por el backend. */
  member: { userId: string; name: string | null };
  /** `YYYY-MM`. */
  period: string;
  /** Vencimiento (gracia) o expulsión, `YYYY-MM-DD`. */
  date: string;
  amount: Money;
  lateFee: Money | null;
  /** Deuda saldada o devolución pagada; `null` si sigue pendiente. */
  settledAt: Date | null;
  graceEndsOn: string | null;
}

export interface DelinquencyPage {
  items: DelinquencyItem[];
  nextCursor: string | null;
  /** Pendiente por moneda en toda la vista. */
  pending: Money[];
}
