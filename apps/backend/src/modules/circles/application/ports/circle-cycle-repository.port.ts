import { type Period } from '../../../../shared/domain/value-objects/period';
import {
  type CircleCycle,
  type CycleState,
  type Installment,
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
  members: { userId: string; position: number; price?: SlotPrice }[];
  /** Las cuotas del mes en curso. */
  installments: Installment[];
}

export interface CircleCycleRepositoryPort {
  /** Círculos que hay que revisar: en curso, o reuniendo miembros con el mes de inicio ya llegado. */
  listToAdvance(today: Period): Promise<string[]>;
  /**
   * Ejecuta `work` con el círculo bloqueado y guarda en la misma transacción el ciclo que
   * devuelve: estado, mes en curso, cuotas y payouts. Devuelve `false` sin ejecutar nada si otra
   * ejecución tiene el círculo bloqueado. Si `work` falla, no se guarda nada.
   */
  withLock(circleId: string, work: (stored: StoredCycle) => Promise<CircleCycle>): Promise<boolean>;
}
