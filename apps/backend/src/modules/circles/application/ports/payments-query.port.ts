import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';

export const PAYMENTS_QUERY = Symbol('PAYMENTS_QUERY');

/** Una cuota que el usuario todavía debe pagar (COPAYNI-35). */
export interface DueInstallment {
  /** Para pagarla desde la app (POST /v1/me/installments/:id/pay, COPAYNI-63). */
  installmentId: string;
  circleId: string;
  period: Period;
  dueOn: LocalDate;
  amount: Money;
  /** `overdue`: el cobro falló y la cuota está en gracia (COPAYNI-57). */
  status: 'pending' | 'overdue';
}

export const TRANSACTION_TYPES = ['payment', 'payout'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Qué movimiento es (COPAYNI-41). Pagos: una cuota cobrada o una deuda por impago saldada.
 * Cobros: un payout o la devolución a un expulsado antes de su turno.
 */
export type TransactionKind = 'installment' | 'debt_settlement' | 'payout' | 'refund';

export interface Transaction {
  id: string;
  type: TransactionType;
  kind: TransactionKind;
  circleId: string;
  /** Mes del círculo; `null` en una devolución, que se paga al cerrar el círculo. */
  period: Period | null;
  amount: Money;
  occurredAt: Date;
}

export interface TransactionPage {
  items: Transaction[];
  /** `null` si no hay más páginas. */
  nextCursor: string | null;
}

/** Una cuota por su id, con su círculo (COPAYNI-63). */
export interface InstallmentRef {
  id: string;
  circleId: string;
  userId: string;
  period: Period;
  amount: Money;
  status: string;
  /** El miembro fue expulsado del círculo. */
  expelled: boolean;
}

/** Lecturas de los pagos del usuario, para la sección Payment de la app. */
export interface PaymentsQueryPort {
  /** La cuota, o `null` si no existe. */
  installment(id: string): Promise<InstallmentRef | null>;
  /** Cuotas pendientes o vencidas en gracia, de la que vence antes a la que vence después. */
  dueInstallmentsOf(userId: string): Promise<DueInstallment[]>;
  /**
   * Pagos o cobros del usuario, del más reciente al más antiguo. Rechaza un cursor ajeno con
   * InvalidCursorError.
   */
  transactionsOf(query: {
    userId: string;
    type: TransactionType;
    limit: number;
    cursor: string | null;
  }): Promise<TransactionPage>;
}
