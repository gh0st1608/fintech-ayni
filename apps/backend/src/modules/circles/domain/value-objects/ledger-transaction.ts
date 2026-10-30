import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { DomainError } from '../../../../shared/errors/app-error';

/**
 * Cuentas del registro contable (COPAYNI-58). El saldo de una cuenta es la suma de sus
 * movimientos: positivo, el dinero que tiene.
 * - `circle_pot`: el pozo de un círculo en un mes; queda en cero al cerrarlo.
 * - `guarantee_fund`: el fondo de garantía propio (R16). Negativo si debe a un miembro.
 * - `operator`: la cooperativa (Admin Fees, fees y descuentos de los slots).
 * - `member_payable`: lo que el fondo le debe a un miembro por un pozo reducido.
 * - `refunds_payable`: la devolución pendiente de un expulsado.
 * - `retention_held`: la retención del payout de un miembro, que paga sus últimas cuotas
 *   (COPAYNI-60).
 * - `external`: fuera de Ayni (pasarela, cuentas de los miembros).
 */
export const LEDGER_ACCOUNTS = [
  'circle_pot',
  'guarantee_fund',
  'operator',
  'member_payable',
  'refunds_payable',
  'retention_held',
  'external',
] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export const LEDGER_KINDS = [
  /** Cuotas cobradas del mes: la cuota base al pozo, el resto a `operator`. */
  'collection',
  /** El fondo cubre lo que falta para el payout completo (pending-scope §3.1, regla 5). */
  'coverage',
  'payout',
  /** Lo que queda en el pozo después del payout (redondeo o Admin Fees descontadas). */
  'operator_residual',
  /** Aporte de las Admin Fees al fondo (R16). */
  'fund_contribution',
  /** Pozo sin destinatario que vuelve al fondo (regla 6). */
  'pot_returned',
  /** El fondo no alcanzó: el pozo se redujo y el fondo le debe la diferencia (regla 7). */
  'fund_debt_to_member',
  /** Al cerrar el círculo, lo que pagó el expulsado antes de su turno pasa a devolución. */
  'refund_due',
  /** La penalidad sobre esa devolución queda en el fondo. */
  'penalty',
  'refund_paid',
  /** El expulsado pagó lo vencido más el cargo por mora: vuelve al fondo. */
  'debt_recovered',
  /** Retención del payout de quien cobra en la primera mitad (COPAYNI-60). */
  'retention_held',
  /** La retención paga sus últimas cuotas. */
  'retention_applied',
  /** Expulsado después de cobrar: su retención va al fondo y reduce su deuda. */
  'retention_to_fund',
  /** La cuota de quien cobra se descontó de su payout: fees y Admin Fees a `operator`. */
  'payin_deducted',
  /** La cooperativa paga el descuento de referidos de una cuota (COPAYNI-53). */
  'referral_discount',
  /** Movimientos manuales del back-office, con motivo. */
  'seed_capital',
  'adjustment',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

const MANUAL_KINDS: ReadonlySet<LedgerKind> = new Set(['seed_capital', 'adjustment']);

export interface LedgerEntry {
  readonly account: LedgerAccount;
  /** Positivo: entra dinero a la cuenta; negativo: sale. */
  readonly amount: Money;
  /** El miembro, en `member_payable`, `refunds_payable`, `retention_held` y `external`. */
  readonly userId?: string;
}

export class InvalidLedgerTransactionError extends DomainError {
  constructor(message: string) {
    super('INVALID_LEDGER_TRANSACTION', message);
  }
}

/**
 * Movimiento de doble entrada: sus asientos suman cero en una sola moneda. Es inmutable y se
 * guarda una sola vez por `key` (idempotencia); una corrección es otro movimiento.
 */
export class LedgerTransaction {
  private constructor(
    readonly key: string,
    readonly kind: LedgerKind,
    readonly entries: readonly LedgerEntry[],
    readonly circleId: string | null,
    readonly period: Period | null,
    readonly reason: string | null,
  ) {}

  static create(props: {
    key: string;
    kind: LedgerKind;
    entries: readonly LedgerEntry[];
    circleId?: string;
    period?: Period;
    reason?: string;
  }): LedgerTransaction {
    const entries = props.entries.filter(({ amount }) => !amount.isZero());
    const [first] = entries;
    if (!props.key.trim())
      throw new InvalidLedgerTransactionError('El movimiento necesita una clave');
    if (!first || entries.length < 2) {
      throw new InvalidLedgerTransactionError('El movimiento necesita al menos dos asientos');
    }
    if (entries.some(({ amount }) => !amount.hasSameCurrency(first.amount))) {
      throw new InvalidLedgerTransactionError('Los asientos deben ser de una sola moneda');
    }
    const total = entries.reduce(
      (sum, { amount }) => sum.add(amount),
      Money.zero(first.amount.currency),
    );
    if (!total.isZero()) throw new InvalidLedgerTransactionError('Los asientos deben sumar cero');
    const reason = props.reason?.trim() || null;
    if (MANUAL_KINDS.has(props.kind) && !reason) {
      throw new InvalidLedgerTransactionError('Un movimiento manual necesita un motivo');
    }
    return new LedgerTransaction(
      props.key,
      props.kind,
      entries.map((entry) => ({ ...entry })),
      props.circleId ?? null,
      props.period ?? null,
      reason,
    );
  }

  /**
   * Traslada `amount` de una cuenta a otra; `null` si el monto es cero (no hay nada que
   * registrar). Un monto negativo traslada en sentido contrario.
   */
  static transfer(props: {
    key: string;
    kind: LedgerKind;
    from: Omit<LedgerEntry, 'amount'>;
    to: Omit<LedgerEntry, 'amount'>;
    amount: Money;
    circleId?: string;
    period?: Period;
    reason?: string;
  }): LedgerTransaction | null {
    const { from, to, amount, ...rest } = props;
    if (amount.isZero()) return null;
    return LedgerTransaction.create({
      ...rest,
      entries: [
        { ...from, amount: Money.zero(amount.currency).subtract(amount) },
        { ...to, amount },
      ],
    });
  }

  /** Lo que el movimiento cambia el saldo de `account`. */
  netFor(account: LedgerAccount): Money {
    return this.entries
      .filter((entry) => entry.account === account)
      .reduce((sum, { amount }) => sum.add(amount), Money.zero(this.entries[0]!.amount.currency));
  }
}
