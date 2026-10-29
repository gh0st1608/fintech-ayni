import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { type CircleTerms } from '../value-objects/circle-terms';
import { LedgerTransaction } from '../value-objects/ledger-transaction';

export interface PeriodReceiver {
  userId: string;
  /** Sin la retención. */
  netPayout: Money;
  adminFee: Money;
  /** Lo que se le retiene del payout (COPAYNI-60); cero si no. */
  retention?: Money;
}

/** Cuota de un mes que paga la retención de su miembro (COPAYNI-60). */
export interface RetainedInstallment {
  userId: string;
  amount: Money;
}

export interface PeriodSettlementInput {
  circleId: string;
  terms: CircleTerms;
  period: Period;
  /** Montos de las cuotas pagadas del mes. */
  paid: readonly Money[];
  /** La parte de esas cuotas que es puesta al día de una vacante (COPAYNI-59): va al fondo. */
  catchUp?: Money;
  /** Cuotas del mes que paga la retención del miembro en vez de cobrarse (COPAYNI-60). */
  retained?: readonly RetainedInstallment[];
  /**
   * La cuota del mes de quien cobra, si pidió descontarla del payout (COPAYNI-38): no se cobra y
   * el payout se paga sin ella.
   */
  deducted?: Money;
  /** Quien tiene el turno del mes, o `undefined` si está libre. */
  receiver: PeriodReceiver | undefined;
  /** Saldo del fondo antes de cerrar el mes. */
  fundBalance: Money;
  /** Parte de las Admin Fees de quien cobra que va al fondo (R16). */
  feeShareBps: number;
}

export interface PeriodSettlement {
  transactions: LedgerTransaction[];
  /** Lo que se le paga a quien cobra; `null` si el turno está libre. */
  payout: Money | null;
  coverage: Money;
  /** Lo que el fondo no pudo cubrir: el pozo se redujo en ese monto. */
  shortfall: Money;
  /** Pozo sin destinatario que volvió al fondo. */
  returned: Money;
  fundBalance: Money;
}

const max = (a: Money, b: Money): Money => (a.amount >= b.amount ? a : b);
const min = (a: Money, b: Money): Money => (a.amount <= b.amount ? a : b);

/**
 * Cierre contable de un mes (COPAYNI-58, pending-scope §3.1). El pozo se mide en cuotas base:
 * de cada cuota cobrada, la cuota base va al pozo, la puesta al día de quien tomó una vacante al
 * fondo (COPAYNI-59) y el resto (fee y Admin Fees del slot, menos su descuento) a `operator`.
 * Luego:
 * 1. El fondo cubre lo que falta para el payout completo, o para el payout del círculo si el
 *    turno del expulsado está libre. Solo puede cubrir con el saldo que tiene. No hay turnos que
 *    nunca se llenaron: el círculo solo empieza completo (pending-scope R2).
 * 2. Con quien cobra: se le retiene la retención de su turno (COPAYNI-60), se le paga el resto
 *    del payout y el fondo recibe su aporte de las Admin Fees. Si el fondo no alcanzó, se reduce
 *    lo que se le paga y el fondo le debe la diferencia.
 * Las cuotas que paga una retención entran al pozo desde `retention_held`. La cuota que quien
 * cobra descuenta del payout (COPAYNI-38) cuenta en el pozo y se descuenta de lo que se le paga;
 * su parte de fees y Admin Fees va a `operator` (`payin_deducted`).
 * 3. Sin quien cobra: el pozo entero vuelve al fondo.
 * 4. Lo que queda en el pozo va a `operator`: el pozo siempre cierra en cero.
 *
 * Invariante: payout + residuo + pozo devuelto = cuotas base cobradas + cobertura.
 */
export function settlePeriod(input: PeriodSettlementInput): PeriodSettlement {
  const { circleId, terms, period, paid, receiver, feeShareBps } = input;
  const currency = terms.currency;
  const zero = Money.zero(currency);
  const at = `${circleId}:${period.toString()}`;
  const pot = { account: 'circle_pot' as const };
  const fund = { account: 'guarantee_fund' as const };
  const operator = { account: 'operator' as const };
  const common = { circleId, period };
  const transactions: LedgerTransaction[] = [];
  const add = (transaction: LedgerTransaction | null) => {
    if (transaction) transactions.push(transaction);
  };

  const collected = paid.reduce((sum, amount) => sum.add(amount), zero);
  const retained = input.retained ?? [];
  for (const { userId, amount } of retained) {
    add(
      LedgerTransaction.create({
        key: `retention_applied:${at}:${userId}`,
        kind: 'retention_applied',
        entries: [
          { account: 'retention_held', userId, amount: zero.subtract(amount) },
          { ...pot, amount: terms.baseInstallment },
          { ...operator, amount: amount.subtract(terms.baseInstallment) },
        ],
        ...common,
      }),
    );
  }
  const base = terms.baseInstallment.times(paid.length + retained.length);
  const collectedBase = terms.baseInstallment.times(paid.length);
  const catchUp = input.catchUp ?? zero;
  if (paid.length > 0) {
    add(
      LedgerTransaction.create({
        key: `collection:${at}`,
        kind: 'collection',
        entries: [
          { account: 'external', amount: zero.subtract(collected) },
          { ...pot, amount: collectedBase },
          { ...fund, amount: catchUp },
          { ...operator, amount: collected.subtract(collectedBase).subtract(catchUp) },
        ],
        ...common,
      }),
    );
  }
  const fundAfterCollection = input.fundBalance.add(catchUp);

  const retention = receiver?.retention ?? zero;
  const deducted = receiver ? (input.deducted ?? zero) : zero;
  const deductedBase = deducted.isZero() ? zero : terms.baseInstallment;
  const target = receiver ? receiver.netPayout.add(retention) : terms.payout;
  const need = max(zero, target.subtract(base).subtract(deductedBase));
  const coverage = min(need, max(zero, fundAfterCollection));
  const shortfall = need.subtract(coverage);
  add(
    LedgerTransaction.transfer({
      key: `coverage:${at}`,
      kind: 'coverage',
      from: fund,
      to: pot,
      amount: coverage,
      ...common,
    }),
  );
  let fundBalance = fundAfterCollection.subtract(coverage);
  const potBalance = base.add(coverage);

  let payout: Money | null = null;
  let returned = zero;
  if (receiver) {
    // La retención va completa: paga cuotas del miembro. Si el pozo se redujo, se reduce el payout.
    const held = min(retention, potBalance);
    add(
      LedgerTransaction.transfer({
        key: `retention_held:${at}`,
        kind: 'retention_held',
        from: pot,
        to: { account: 'retention_held', userId: receiver.userId },
        amount: held,
        ...common,
      }),
    );
    payout = max(
      zero,
      min(receiver.netPayout, potBalance.add(deductedBase).subtract(held)).subtract(deducted),
    );
    add(
      LedgerTransaction.transfer({
        key: `payin_deducted:${at}`,
        kind: 'payin_deducted',
        from: pot,
        to: operator,
        amount: deducted.subtract(deductedBase),
        ...common,
      }),
    );
    add(
      LedgerTransaction.transfer({
        key: `payout:${at}`,
        kind: 'payout',
        from: pot,
        to: { account: 'external', userId: receiver.userId },
        amount: payout,
        ...common,
      }),
    );
    add(
      LedgerTransaction.transfer({
        key: `fund_debt:${at}`,
        kind: 'fund_debt_to_member',
        from: fund,
        to: { account: 'member_payable', userId: receiver.userId },
        amount: shortfall,
        ...common,
      }),
    );
    const contribution = receiver.adminFee.percentage(feeShareBps);
    add(
      LedgerTransaction.transfer({
        key: `fund_contribution:${at}`,
        kind: 'fund_contribution',
        from: operator,
        to: fund,
        amount: contribution,
        ...common,
      }),
    );
    fundBalance = fundBalance.subtract(shortfall).add(contribution);
  } else {
    returned = potBalance;
    add(
      LedgerTransaction.transfer({
        key: `pot_returned:${at}`,
        kind: 'pot_returned',
        from: pot,
        to: fund,
        amount: returned,
        ...common,
      }),
    );
    fundBalance = fundBalance.add(returned);
  }

  add(
    LedgerTransaction.transfer({
      key: `operator_residual:${at}`,
      kind: 'operator_residual',
      from: pot,
      to: operator,
      amount: potBalance
        .subtract(payout ?? zero)
        .subtract(returned)
        .subtract(receiver ? min(retention, potBalance) : zero)
        .subtract(deducted.subtract(deductedBase)),
      ...common,
    }),
  );
  return { transactions, payout, coverage, shortfall, returned, fundBalance };
}

/**
 * Devolución al expulsado antes de su turno, al cerrar el círculo (pending-scope §3.1): lo que
 * pagó pasa a devolución, la penalidad queda en el fondo y se le paga el resto.
 */
export function refundTransactions(props: {
  circleId: string;
  userId: string;
  paid: Money;
  refund: Money;
}): LedgerTransaction[] {
  const { circleId, userId, paid, refund } = props;
  const at = `${circleId}:${userId}`;
  const payable = { account: 'refunds_payable' as const, userId };
  const fund = { account: 'guarantee_fund' as const };
  return [
    LedgerTransaction.transfer({
      key: `refund_due:${at}`,
      kind: 'refund_due',
      from: fund,
      to: payable,
      amount: paid,
      circleId,
    }),
    LedgerTransaction.transfer({
      key: `penalty:${at}`,
      kind: 'penalty',
      from: payable,
      to: fund,
      amount: paid.subtract(refund),
      circleId,
    }),
    LedgerTransaction.transfer({
      key: `refund_paid:${at}`,
      kind: 'refund_paid',
      from: payable,
      to: { account: 'external', userId },
      amount: refund,
      circleId,
    }),
  ].filter((transaction): transaction is LedgerTransaction => transaction !== null);
}
