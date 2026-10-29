import {
  type PeriodSettlementInput,
  refundTransactions,
  settlePeriod,
} from '@src/modules/circles/domain/services/period-settlement';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import {
  type LEDGER_ACCOUNTS,
  type LedgerTransaction,
} from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (amount: number) => Money.of(amount, 'PEN');
/** Payout de 30.000 en 10 meses: cuota base de 3.000. */
const TERMS = CircleTerms.create({
  payout: pen(3_000_000),
  months: 10,
  startsOn: Period.of(2026, 11),
});
const BASE = TERMS.baseInstallment.amount;

function input(overrides: Partial<PeriodSettlementInput> = {}): PeriodSettlementInput {
  return {
    circleId: 'c-1',
    terms: TERMS,
    period: Period.of(2026, 11),
    paid: Array.from({ length: 10 }, () => pen(BASE)),
    receiver: { userId: 'ana', netPayout: pen(3_000_000), adminFee: pen(360_000) },
    fundBalance: pen(1_000_000),
    feeShareBps: 2_500,
    ...overrides,
  };
}

const net = (transactions: LedgerTransaction[], account: (typeof LEDGER_ACCOUNTS)[number]) =>
  transactions.reduce((sum, transaction) => sum.add(transaction.netFor(account)), pen(0)).amount;

describe('settlePeriod', () => {
  it('con todas las cuotas: la base al pozo, el resto a operator, payout completo y aporte al fondo', () => {
    // Ana paga 3.360: base más su parte de Admin Fees; el último paga 2.900 por su descuento.
    const paid = [
      pen(BASE + 36_000),
      ...Array.from({ length: 8 }, () => pen(BASE)),
      pen(BASE - 10_000),
    ];
    const settlement = settlePeriod(input({ paid }));

    expect(settlement).toMatchObject({
      payout: pen(3_000_000),
      coverage: pen(0),
      shortfall: pen(0),
      returned: pen(0),
      fundBalance: pen(1_000_000 + 90_000),
    });
    expect(settlement.transactions.map(({ key }) => key)).toEqual([
      'collection:c-1:2026-11',
      'payout:c-1:2026-11',
      'fund_contribution:c-1:2026-11',
    ]);
    expect(net(settlement.transactions, 'circle_pot')).toBe(0);
    expect(net(settlement.transactions, 'operator')).toBe(26_000 - 90_000);
    expect(settlement.transactions[1]!.entries[1]).toEqual({
      account: 'external',
      userId: 'ana',
      amount: pen(3_000_000),
    });
  });

  it('el fondo cubre la cuota que falta y quien cobra recibe el payout completo', () => {
    const settlement = settlePeriod(input({ paid: Array.from({ length: 9 }, () => pen(BASE)) }));
    expect(settlement).toMatchObject({ payout: pen(3_000_000), coverage: pen(BASE) });
    expect(settlement.fundBalance).toEqual(pen(1_000_000 - BASE + 90_000));
  });

  it('si el fondo no alcanza, el pozo se reduce y el fondo le debe la diferencia', () => {
    const settlement = settlePeriod(
      input({ paid: Array.from({ length: 8 }, () => pen(BASE)), fundBalance: pen(100_000) }),
    );
    expect(settlement).toMatchObject({
      payout: pen(3_000_000 - 500_000),
      coverage: pen(100_000),
      shortfall: pen(500_000),
    });
    expect(net(settlement.transactions, 'member_payable')).toBe(500_000);
    // Queda en negativo: es lo que le debe a Ana, menos su aporte.
    expect(settlement.fundBalance).toEqual(pen(-500_000 + 90_000));

    const broke = settlePeriod(
      input({ paid: Array.from({ length: 9 }, () => pen(BASE)), fundBalance: pen(-1) }),
    );
    expect(broke.coverage).toEqual(pen(0));
    expect(broke.shortfall).toEqual(pen(BASE));
  });

  it('sin quien cobra, cubre hasta el payout del círculo y el pozo entero vuelve al fondo', () => {
    const settlement = settlePeriod(
      input({ receiver: undefined, paid: Array.from({ length: 9 }, () => pen(BASE)) }),
    );
    expect(settlement).toMatchObject({
      payout: null,
      coverage: pen(BASE),
      returned: pen(3_000_000),
      fundBalance: pen(1_000_000 - BASE + 3_000_000),
    });
    expect(settlement.transactions.map(({ kind }) => kind)).toEqual([
      'collection',
      'coverage',
      'pot_returned',
    ]);
  });

  it('con las Admin Fees descontadas del payout, lo que sobra del pozo va a operator', () => {
    const settlement = settlePeriod(
      input({ receiver: { userId: 'ana', netPayout: pen(2_640_000), adminFee: pen(360_000) } }),
    );
    expect(settlement.payout).toEqual(pen(2_640_000));
    expect(settlement.transactions.map(({ kind }) => kind)).toContain('operator_residual');
    expect(net(settlement.transactions, 'circle_pot')).toBe(0);
  });

  it('un mes sin cuotas pagadas no registra cobranza', () => {
    const settlement = settlePeriod(input({ paid: [], receiver: undefined, fundBalance: pen(0) }));
    expect(settlement.transactions).toEqual([]);
    expect(settlement.returned).toEqual(pen(0));
  });

  /**
   * Prueba de propiedades con un generador determinístico (semilla fija): para cualquier mes, el
   * registro cuadra y el pozo cierra en cero.
   */
  it('propiedad: el pozo pagado es lo cobrado más la cobertura, y el registro siempre cuadra', () => {
    let seed = 20_261_029;
    const random = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % (max + 1);
    };
    for (let run = 0; run < 500; run += 1) {
      const months = 2 + random(22);
      const terms = CircleTerms.create({
        payout: pen((1 + random(500)) * 1_000 * months),
        months,
        startsOn: Period.of(2026, 1 + random(11)),
      });
      const base = terms.baseInstallment.amount;
      const paid = Array.from({ length: random(months) }, () =>
        pen(base + random(base) - random(base)),
      );
      const receiver =
        random(3) > 0
          ? {
              userId: 'u',
              netPayout: terms.payout.subtract(pen(random(terms.payout.amount / 10))),
              adminFee: pen(random(terms.payout.amount / 5)),
            }
          : undefined;
      const fundStart = pen(random(terms.payout.amount * 2) - terms.payout.amount / 2);
      const settlement = settlePeriod({
        circleId: `c-${run}`,
        terms,
        period: terms.startsOn,
        paid,
        receiver,
        fundBalance: fundStart,
        feeShareBps: random(10_000),
      });
      const { transactions, payout, coverage, shortfall, returned, fundBalance } = settlement;
      const residual =
        net(transactions, 'operator') -
        net(
          transactions.filter(({ kind }) => kind !== 'operator_residual'),
          'operator',
        );

      for (const transaction of transactions) {
        expect(transaction.entries.reduce((sum, { amount }) => sum + amount.amount, 0)).toBe(0);
      }
      expect(net(transactions, 'circle_pot')).toBe(0);
      expect((payout?.amount ?? 0) + residual + returned.amount).toBe(
        base * paid.length + coverage.amount,
      );
      expect(coverage.amount).toBeGreaterThanOrEqual(0);
      expect(coverage.amount).toBeLessThanOrEqual(Math.max(fundStart.amount, 0));
      expect(fundBalance.amount).toBe(fundStart.amount + net(transactions, 'guarantee_fund'));
      if (receiver) {
        expect(payout!.amount + shortfall.amount).toBe(receiver.netPayout.amount);
        expect(net(transactions, 'member_payable')).toBe(shortfall.amount);
      } else {
        expect(shortfall.isZero() || payout === null).toBe(true);
      }
      expect(new Set(transactions.map(({ key }) => key)).size).toBe(transactions.length);
    }
  });
});

describe('refundTransactions', () => {
  it('lo pagado pasa a devolución, la penalidad queda en el fondo y se paga el resto', () => {
    const transactions = refundTransactions({
      circleId: 'c-1',
      userId: 'caro',
      paid: pen(1_200_000),
      refund: pen(1_140_000),
    });
    expect(transactions.map(({ kind }) => kind)).toEqual(['refund_due', 'penalty', 'refund_paid']);
    expect(net(transactions, 'guarantee_fund')).toBe(-1_140_000);
    expect(net(transactions, 'refunds_payable')).toBe(0);
    expect(net(transactions, 'external')).toBe(1_140_000);
  });

  it('sin nada pagado no registra nada', () => {
    expect(
      refundTransactions({ circleId: 'c-1', userId: 'caro', paid: pen(0), refund: pen(0) }),
    ).toEqual([]);
  });
});
