import { type Money } from '../../../../shared/domain/value-objects/money';
import { type LedgerTransaction } from '../../domain/value-objects/ledger-transaction';

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
  /**
   * Marca saldada la deuda del usuario en ese círculo y guarda, en la misma transacción, el
   * movimiento contable que devuelve `recovery` (COPAYNI-58). `null` si no había una abierta.
   */
  settle(
    userId: string,
    circleId: string,
    recovery: (debt: MemberDebt) => LedgerTransaction,
  ): Promise<MemberDebt | null>;
}
