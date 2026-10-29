import type { Money } from '@/domain/shared/value-objects/Money';

import type { SlotType } from './value-objects/Slot';

/** `active` incluye los círculos que todavía no empezaron; `finished`, las membresías expulsadas. */
export const MY_CIRCLE_STATUSES = ['active', 'finished'] as const;
export type MyCircleStatus = (typeof MY_CIRCLE_STATUSES)[number];

/** Un círculo al que el usuario se unió, con su turno y el precio de su slot (GET /me/circles). */
export interface MyCircle {
  circleId: string;
  status: MyCircleStatus;
  payout: Money;
  months: number;
  /** Primer y último mes del círculo (YYYY-MM). */
  startsOn: string;
  endsOn: string;
  /** 1 = cobra el primer mes. */
  position: number;
  /** Mes de cobro del usuario (YYYY-MM). */
  payoutPeriod: string;
  type: SlotType;
  /** Una cuota por mes del círculo, en orden. */
  installments: Money[];
  adminFee: Money;
  netPayout: Money;
  joinedAt: Date;
  /** Expulsado por impago (COPAYNI-57): se lista con los finalizados. */
  expelled: boolean;
}

export interface MyCirclesPage {
  items: MyCircle[];
  /** `null` si no hay más páginas. */
  nextCursor: string | null;
}

const monthIndex = (period: string): number => {
  const [year, month] = period.split('-').map(Number);
  return year! * 12 + (month! - 1);
};

/**
 * Cuota del mes `period` (YYYY-MM). Antes del inicio se muestra la primera, y en un círculo
 * terminado, la última.
 */
export function installmentFor(circle: MyCircle, period: string): Money {
  const index = monthIndex(period) - monthIndex(circle.startsOn);
  const clamped = Math.min(Math.max(index, 0), circle.installments.length - 1);
  return circle.installments[clamped]!;
}
