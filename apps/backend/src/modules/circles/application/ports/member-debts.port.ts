import { type Money } from '../../../../shared/domain/value-objects/money';

export const MEMBER_DEBTS = Symbol('MEMBER_DEBTS');

/** Deuda de un miembro expulsado por impago (COPAYNI-57). */
export interface MemberDebt {
  circleId: string;
  /** Lo vencido, sin el cargo por mora (`Expulsion.overdue`). */
  overdue: Money;
  lateFee: Money;
}

/**
 * Deudas por impago. Las registra la expulsión, en la misma transacción del ciclo
 * (CircleCycleRepositoryPort); mientras haya una abierta, el usuario no puede unirse a otro
 * círculo.
 */
export interface MemberDebtsPort {
  /** Las deudas sin saldar del usuario. */
  openDebtsOf(userId: string): Promise<MemberDebt[]>;
  /** Marca saldada la deuda del usuario en ese círculo; `false` si no había una abierta. */
  settle(userId: string, circleId: string): Promise<boolean>;
}
