import type { Money } from '@/domain/shared/value-objects/Money';

/** Un círculo abierto que se le recomienda al usuario (GET /circles/recommended). */
export interface RecommendedCircle {
  circleId: string;
  payout: Money;
  months: number;
  /** Primer y último mes (YYYY-MM). */
  startsOn: string;
  endsOn: string;
  /** payout / meses; la cuota real depende del slot que se elija. */
  baseInstallment: Money;
  adminFee: Money;
  /** Slots libres; en un círculo en curso, sus vacantes abiertas. */
  availableSlots: number;
  /**
   * Turnos vacantes de un círculo en curso (COPAYNI-59): los deja un expulsado y los toma un
   * miembro nuevo pagando la puesta al día. Vacío si el círculo no empezó.
   */
  vacancies: { position: number; payoutPeriod: string }[];
}

/** El círculo recomendado al que apunta "Join now": sus slots se piden con su `circleId`. */
export interface JoinTarget {
  circleId: string;
  months: number;
}
