import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { type CircleTerms } from '../value-objects/circle-terms';
import { LedgerTransaction } from '../value-objects/ledger-transaction';

export interface PeriodReceiver {
  userId: string;
  netPayout: Money;
  adminFee: Money;
}

export interface PeriodSettlementInput {
  circleId: string;
  terms: CircleTerms;
  period: Period;
  /** Montos de las cuotas pagadas del mes. */
  paid: readonly Money[];
  /** La parte de esas cuotas que es puesta al día de una vacante (COPAYNI-59): va al fondo. */
  catchUp?: Money;
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
 * 2. Con quien cobra: se le paga el payout y el fondo recibe su aporte de las Admin Fees. Si el
 *    fondo no alcanzó, el pozo se reduce y el fondo le debe la diferencia.
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
  const base = terms.baseInstallment.times(paid.length);
  const catchUp = input.catchUp ?? zero;
  if (paid.length > 0) {
    add(
      LedgerTransaction.create({
        key: `collection:${at}`,
        kind: 'collection',
        entries: [
          { account: 'external', amount: zero.subtract(collected) },
          { ...pot, amount: base },
          { ...fund, amount: catchUp },
          { ...operator, amount: collected.subtract(base).subtract(catchUp) },
        ],
        ...common,
      }),
    );
  }
  const fundAfterCollection = input.fundBalance.add(catchUp);

  const target = receiver ? receiver.netPayout : terms.payout;
  const need = max(zero, target.subtract(base));
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
    payout = min(target, potBalance);
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
      amount: potBalance.subtract(payout ?? zero).subtract(returned),
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
