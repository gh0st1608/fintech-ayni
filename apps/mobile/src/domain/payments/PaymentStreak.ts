/** `pending`: el mes todavía puede pagarse a tiempo; no cuenta ni rompe la racha. */
export type StreakMonthStatus = 'onTime' | 'late' | 'pending';

export interface StreakMonth {
  /** YYYY-MM. */
  period: string;
  status: StreakMonthStatus;
}

/** Racha de pagos a tiempo (GET /me/payment-streak, COPAYNI-82). */
export interface PaymentStreak {
  /** Meses seguidos con todas las cuotas pagadas hasta el fin de la gracia. */
  months: number;
  /** Los últimos meses con cuotas, del más antiguo al más reciente. */
  lastMonths: StreakMonth[];
}
