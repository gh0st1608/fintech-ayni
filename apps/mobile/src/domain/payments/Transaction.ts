import type { Money } from '@/domain/shared/value-objects/Money';

export const TRANSACTION_TYPES = ['payment', 'payout'] as const;
/** `payment`: lo que el usuario pagó; `payout`: lo que recibió. */
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type TransactionKind = 'installment' | 'debtSettlement' | 'payout' | 'refund';

/** Un movimiento del historial (GET /me/transactions, COPAYNI-41). */
export interface Transaction {
  id: string;
  type: TransactionType;
  kind: TransactionKind;
  circleId: string;
  /** Mes del círculo (YYYY-MM); `null` en una devolución. */
  period: string | null;
  amount: Money;
  occurredAt: Date;
}

/** Detalle de un movimiento (GET /me/transactions/:id, COPAYNI-78). */
export interface TransactionDetail extends Transaction {
  /** Pozo del círculo: lo identifica y, en un payout, es el monto bruto. */
  circlePayout: Money;
  /** Turno del usuario en ese círculo. */
  position: number;
  /** En un payout, lo descontado del pozo (retención y cuotas descontadas); si no, `null`. */
  deductions: Money | null;
}

export interface TransactionsPage {
  items: Transaction[];
  /** `null` si no hay más páginas. */
  nextCursor: string | null;
}
