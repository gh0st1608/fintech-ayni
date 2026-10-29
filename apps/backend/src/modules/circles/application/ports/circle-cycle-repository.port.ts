import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import {
  type CircleCycle,
  type CycleState,
  type Installment,
  type PendingRefund,
} from '../../domain/entities/circle-cycle';
import { type SlotPrice } from '../../domain/services/slot-pricing';
import { type CircleTerms } from '../../domain/value-objects/circle-terms';

export const CIRCLE_CYCLE_REPOSITORY = Symbol('CIRCLE_CYCLE_REPOSITORY');

/** Un círculo tal como está guardado; el caso de uso le pone precio a cada miembro. */
export interface StoredCycle {
  circleId: string;
  terms: CircleTerms;
  state: CycleState;
  currentPeriod: Period | null;
  /** `deductPayIn`: descontar la cuota de su mes de cobro del payout (COPAYNI-38). */
  members: { userId: string; position: number; price?: SlotPrice; deductPayIn?: boolean }[];
  /** Las cuotas del mes en curso. */
  installments: Installment[];
  /**
   * Saldo del fondo de garantía en la moneda del círculo (COPAYNI-58), leído con el fondo
   * bloqueado: dos círculos no pueden gastar el mismo saldo.
   */
  fundBalance: Money;
  /** Devoluciones de los expulsados de este círculo que todavía no se pagaron. */
  pendingRefunds: PendingRefund[];
  /** Desde cuándo está pausado (COPAYNI-61); `null` si no lo está. */
  pausedOn: LocalDate | null;
}

export interface CircleCycleRepositoryPort {
  /** Círculos que hay que revisar: en curso, o reuniendo miembros con el mes de inicio ya llegado. */
  listToAdvance(today: Period): Promise<string[]>;
  /**
   * Ejecuta `work` con el círculo bloqueado y guarda en la misma transacción el ciclo que
   * devuelve: estado, mes en curso, cuotas y payouts. Devuelve `false` sin ejecutar nada si otra
   * ejecución tiene el círculo bloqueado. Si `work` falla, no se guarda nada. También guarda los
   * movimientos contables (`CircleCycle.ledger`), una sola vez por clave, y marca pagadas las
   * devoluciones (`CircleCycle.refunds`).
   *
   * Con `wait` espera el bloqueo en vez de devolver `false` (la pausa del admin general,
   * COPAYNI-61). Guarda también el calendario corrido (`calendarShift`), la fecha de pausa y los
   * eventos de auditoría (`adminEvents`).
   */
  withLock(
    circleId: string,
    work: (stored: StoredCycle) => Promise<CircleCycle>,
    options?: { wait?: boolean },
  ): Promise<boolean>;
}
