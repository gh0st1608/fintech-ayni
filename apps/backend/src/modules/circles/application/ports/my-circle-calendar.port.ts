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
  /**
   * Turno en curso (1..N), si ya empezó.
   *
   * Es lo que identifica el avance del ciclo (COPAYNI-117). El mes no sirve para eso fuera de la
   * cadencia mensual: en una junta semanal hay cuatro turnos en el mismo mes, y derivar el turno
   * del mes marcaría cuatro turnos a la vez.
   */
  currentTurn: number | null;
  /** Miembros vigentes (sin expulsados). */
  members: CalendarMember[];
  /** Turnos cuyo payout ya se pagó. */
  paidTurns: number[];
}

export interface MyCircleCalendarPort {
  find(circleId: string): Promise<MyCircleCalendar | null>;
}
