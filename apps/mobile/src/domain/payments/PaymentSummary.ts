import type { Money } from '@/domain/shared/value-objects/Money';

/** `overdue`: el cobro automático falló y la cuota está en gracia (COPAYNI-57). */
export type DuePaymentStatus = 'pending' | 'overdue';

/** Una cuota que el usuario todavía debe pagar. */
export interface DuePayment {
  circleId: string;
  /** Mes del círculo (YYYY-MM). */
  period: string;
  /** Vencimiento (YYYY-MM-DD). */
  dueOn: string;
  amount: Money;
  status: DuePaymentStatus;
}

/** Resumen de la pestaña Payment (GET /me/payments/summary, COPAYNI-35). */
export interface PaymentSummary {
  /** Cuotas por pagar o deuda; sin ellas se muestra el estado vacío. */
  hasDuePayments: boolean;
  totalDue: Money | null;
  nextDueOn: string | null;
  /** Lo vencido más el cargo por mora; mientras exista no puede unirse a círculos. */
  debt: Money | null;
  /** De la que vence antes a la última. */
  duePayments: DuePayment[];
}
