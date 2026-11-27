import type { DuePayment } from '@/domain/payments/PaymentSummary';
import type { Money } from '@/domain/shared/value-objects/Money';

import type { SlotType } from './value-objects/Slot';

/** Estado del ciclo del círculo (docs/api/circles.md, COPAYNI-56). */
export type CircleState =
  'collecting' | 'approving' | 'contributing' | 'paused' | 'cancelled' | 'finished';

/** `paid`: ya cobró; `current`: el turno en curso; `upcoming`: más adelante; `vacant`: sin miembro. */
export type TurnStatus = 'paid' | 'current' | 'upcoming' | 'vacant';

/** Frecuencia de los turnos de una junta (docs/api/circles.md, COPAYNI-100). */
export type Cadence = 'monthly' | 'biweekly' | 'weekly';

export interface CircleTurn {
  position: number;
  /**
   * Ordinal del turno (1..turnCount). Es lo que lo identifica: en una junta semanal hay cuatro
   * turnos en el mismo mes, así que el mes no identifica ninguno (COPAYNI-117).
   */
  turn: number;
  /** Mes de cobro de ese turno (YYYY-MM). */
  period: string;
  /** Día real de cobro (YYYY-MM-DD), calculado por el servidor. No se deriva del mes. */
  payoutOn: string;
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
  /** Cuántos turnos tiene la junta, que son sus puestos y sus cuotas. */
  turnCount: number;
  cadence: Cadence;
  startsOn: string;
  /** Día real del primer turno (YYYY-MM-DD). */
  startsOnDate: string;
  endsOn: string;
  /** Día real del último turno (YYYY-MM-DD). */
  endsOnDate: string;
  currentPeriod: string | null;
  /** Turno en curso (1 a `turnCount`); `null` si no empezó (COPAYNI-117). */
  currentTurn: number | null;
  position: number;
  payoutPeriod: string;
  type: SlotType;
  installments: Money[];
  netPayout: Money;
  retention: Money;
  nextDue: CircleNextDue | null;
  turns: CircleTurn[];
}
