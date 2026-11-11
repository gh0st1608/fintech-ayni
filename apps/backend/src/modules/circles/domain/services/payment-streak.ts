import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Period } from '../../../../shared/domain/value-objects/period';

/** Una cuota del usuario, con lo necesario para saber si la pagó a tiempo. */
export interface InstallmentRecord {
  period: Period;
  dueOn: LocalDate;
  /** `pending`, `paid`, `overdue`, `defaulted`, `retained` o `deducted`. */
  status: string;
  /** Día del pago en la zona horaria del negocio; `null` si no se pagó con un cobro. */
  paidOn: LocalDate | null;
}

/** `on_time`: todas sus cuotas pagadas hasta el fin de la gracia; `late`: alguna no. */
export type MonthStatus = 'on_time' | 'late' | 'pending';

export interface StreakMonth {
  period: Period;
  status: MonthStatus;
}

export interface PaymentStreak {
  /** Meses seguidos con las cuotas pagadas a tiempo, contando desde el último mes cerrado. */
  months: number;
  /** Los últimos meses con cuotas, del más antiguo al más reciente. */
  lastMonths: StreakMonth[];
}

/** Las cuotas que la retención o la deducción del payout pagan solas cuentan como a tiempo. */
const PAID_AUTOMATICALLY = new Set(['retained', 'deducted']);

function installmentStatus(
  installment: InstallmentRecord,
  today: LocalDate,
  graceDays: number,
): MonthStatus {
  const graceEnd = installment.dueOn.addDays(graceDays);
  if (PAID_AUTOMATICALLY.has(installment.status)) return 'on_time';
  if (installment.status === 'paid') {
    return installment.paidOn && !installment.paidOn.isAfter(graceEnd) ? 'on_time' : 'late';
  }
  if (installment.status === 'defaulted') return 'late';
  // Pendiente o vencida en gracia: todavía puede pagarse a tiempo.
  return today.isAfter(graceEnd) ? 'late' : 'pending';
}

/**
 * Racha de pagos a tiempo (COPAYNI-82, D11): meses seguidos en que todas las cuotas del usuario,
 * en todos sus círculos, se pagaron hasta el fin de la gracia. Pagar dentro de la gracia no la
 * rompe; la mora sí. Los meses que todavía pueden pagarse a tiempo no cuentan ni la rompen.
 */
export function paymentStreak(
  installments: readonly InstallmentRecord[],
  today: LocalDate,
  graceDays: number,
  lastMonthsCount = 4,
): PaymentStreak {
  const byPeriod = new Map<string, StreakMonth>();
  for (const installment of installments) {
    const key = installment.period.toString();
    const status = installmentStatus(installment, today, graceDays);
    const current = byPeriod.get(key);
    // Un mes es tan bueno como su peor cuota: late > pending > on_time.
    if (!current || status === 'late' || (status === 'pending' && current.status === 'on_time')) {
      byPeriod.set(key, { period: installment.period, status });
    }
  }
  // Del más reciente al más antiguo: a va después de b si b es posterior.
  const months = [...byPeriod.values()].sort((a, b) => a.period.monthsUntil(b.period));
  let streak = 0;
  for (const month of months) {
    if (month.status === 'pending') {
      if (streak === 0) continue;
      break;
    }
    if (month.status === 'late') break;
    streak += 1;
  }
  return { months: streak, lastMonths: months.slice(0, lastMonthsCount).reverse() };
}
