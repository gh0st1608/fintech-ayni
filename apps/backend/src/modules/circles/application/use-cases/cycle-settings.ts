import { type DelinquencyPolicy } from '../../domain/entities/circle-cycle';

export const CIRCLE_CYCLE = Symbol('CIRCLE_CYCLE');

export interface CircleCycleSettings {
  /** Día del mes en que vence cada cuota (pending-scope R19, provisional). */
  dueDay: number;
  timeZone: string;
  /** Gracia, cargo por mora y penalidad de devolución (COPAYNI-57). */
  delinquency: DelinquencyPolicy;
  /** Parte de las Admin Fees que va al fondo de garantía (COPAYNI-58, R16). */
  fundFeeShareBps: number;
}
