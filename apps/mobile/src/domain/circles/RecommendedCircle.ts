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
  availableSlots: number;
}
