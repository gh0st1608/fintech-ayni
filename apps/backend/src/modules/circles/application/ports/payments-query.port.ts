import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';

export const PAYMENTS_QUERY = Symbol('PAYMENTS_QUERY');

/** Una cuota que el usuario todavía debe pagar (COPAYNI-35). */
export interface DueInstallment {
  circleId: string;
  period: Period;
  dueOn: LocalDate;
  amount: Money;
  /** `overdue`: el cobro falló y la cuota está en gracia (COPAYNI-57). */
  status: 'pending' | 'overdue';
}

/** Lecturas de los pagos del usuario, para la sección Payment de la app. */
export interface PaymentsQueryPort {
  /** Cuotas pendientes o vencidas en gracia, de la que vence antes a la que vence después. */
  dueInstallmentsOf(userId: string): Promise<DueInstallment[]>;
}
