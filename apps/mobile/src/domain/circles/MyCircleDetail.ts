import type { DuePayment } from '@/domain/payments/PaymentSummary';
import type { Money } from '@/domain/shared/value-objects/Money';

import type { SlotType } from './value-objects/Slot';

/** Estado del ciclo del círculo (docs/api/circles.md, COPAYNI-56). */
export type CircleState =
  'collecting' | 'approving' | 'contributing' | 'paused' | 'cancelled' | 'finished';

/** `paid`: ya cobró; `current`: cobra este mes; `upcoming`: más adelante; `vacant`: sin miembro. */
export type TurnStatus = 'paid' | 'current' | 'upcoming' | 'vacant';

export interface CircleTurn {
  position: number;
  /** Mes de cobro de ese turno (YYYY-MM). */
  period: string;
  /** Nombre abreviado ("María R."); `null` si está vacante o sin nombre. */
  memberName: string | null;
  isMe: boolean;
  status: TurnStatus;
}

/** La próxima cuota que el usuario debe en ese círculo. */
export type CircleNextDue = Pick<
  DuePayment,
  'installmentId' | 'period' | 'dueOn' | 'amount' | 'status'
>;

/** Detalle de un círculo para uno de sus miembros (GET /me/circles/:id, COPAYNI-88). */
export interface MyCircleDetail {
  circleId: string;
  state: CircleState;
  payout: Money;
  months: number;
  startsOn: string;
  endsOn: string;
  currentPeriod: string | null;
  /** Mes del ciclo en curso (1 a `months`); `null` si no empezó. */
  currentMonth: number | null;
  position: number;
  payoutPeriod: string;
  type: SlotType;
  installments: Money[];
  netPayout: Money;
  retention: Money;
  nextDue: CircleNextDue | null;
  turns: CircleTurn[];
}
