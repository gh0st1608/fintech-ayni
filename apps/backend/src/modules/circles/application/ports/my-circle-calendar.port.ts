import { type CycleState } from '../../domain/entities/circle-cycle';

export const MY_CIRCLE_CALENDAR = Symbol('MY_CIRCLE_CALENDAR');

/** Un miembro vigente, con lo necesario para mostrar su nombre abreviado. */
export interface CalendarMember {
  userId: string;
  position: number;
  firstName: string | null;
  lastName: string | null;
}

/** El estado del ciclo de un círculo para el detalle que ve un miembro (COPAYNI-88). */
export interface MyCircleCalendar {
  state: CycleState;
  /** Mes en curso del ciclo, `YYYY-MM`, si ya empezó. */
  currentPeriod: string | null;
  /** Miembros vigentes (sin expulsados). */
  members: CalendarMember[];
  /** Meses (`YYYY-MM`) cuyo payout ya se pagó. */
  paidPeriods: string[];
}

export interface MyCircleCalendarPort {
  find(circleId: string): Promise<MyCircleCalendar | null>;
}
