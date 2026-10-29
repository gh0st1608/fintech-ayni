import { CircleCycle, type CycleMember } from '@src/modules/circles/domain/entities/circle-cycle';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';

/** Payout de 3.000 en 3 meses desde noviembre de 2026; vence el día 5, con 3 días de gracia. */
const TERMS = CircleTerms.create({
  payout: Money.of(300_000, 'PEN'),
  months: 3,
  startsOn: Period.of(2026, 11),
});
const day = (value: string) => LocalDate.parse(value);
const member = (userId: string, position: number): CycleMember => ({
  userId,
  position,
  quote: TEST_PRICING.quote(TERMS, position),
});

let ids = 0;
const newId = () => `i-${++ids}`;

function cycle(
  members: CycleMember[] = [member('ana', 1), member('beto', 2), member('caro', 3)],
  fund = Money.of(10_000_000, 'PEN'),
) {
  return CircleCycle.restore({
    circleId: 'c-1',
    terms: TERMS,
    dueDay: 5,
    delinquency: TEST_DELINQUENCY,
    fund: { balance: fund, feeShareBps: TEST_FUND_SHARE_BPS },
    state: 'collecting',
    currentPeriod: null,
    members,
    installments: [],
  });
}

const payAll = (subject: CircleCycle, today: LocalDate) => {
  for (const { id } of subject.dueInstallments(today)) subject.recordCollection(id, 'paid');
};

describe('CircleCycle', () => {
  it('empieza en su mes de inicio y abre una cuota por miembro con su precio', () => {
    const subject = cycle();
    expect(subject.isStartDue(day('2026-10-31'))).toBe(false);
    expect(subject.isStartDue(day('2026-11-01'))).toBe(true);

    subject.start(newId);
    expect(subject.state).toBe('contributing');
    expect(subject.currentPeriod).toEqual(Period.of(2026, 11));
    expect(
      subject.installments.map(({ userId, dueOn, amount, status }) => ({
        userId,
        dueOn: dueOn.toString(),
        amount: amount.amount,
        status,
      })),
    ).toEqual([
      {
        userId: 'ana',
        dueOn: '2026-11-05',
        amount: member('ana', 1).quote.installments[0]!.amount,
        status: 'pending',
      },
      {
        userId: 'beto',
        dueOn: '2026-11-05',
        amount: member('beto', 2).quote.installments[0]!.amount,
        status: 'pending',
      },
      {
        userId: 'caro',
        dueOn: '2026-11-05',
        amount: member('caro', 3).quote.installments[0]!.amount,
        status: 'pending',
      },
    ]);
    expect(subject.isStartDue(day('2026-11-02'))).toBe(false);
  });

  it('solo cobra las cuotas vencidas y cierra el mes cuando todas están pagadas', () => {
    const subject = cycle();
    subject.start(newId);
    expect(subject.dueInstallments(day('2026-11-04'))).toEqual([]);

    const [first, ...rest] = subject.dueInstallments(day('2026-11-05'));
    expect(subject.recordCollection(first!.id, 'failed').status).toBe('overdue');
    rest.forEach(({ id }) => subject.recordCollection(id, 'paid'));
    expect(subject.isPeriodSettled(day('2026-11-05'))).toBe(false);
    expect(() => subject.closePeriod(day('2026-11-05'), newId)).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );

    // La vencida se vuelve a cobrar al día siguiente.
    expect(subject.dueInstallments(day('2026-11-06')).map(({ id }) => id)).toEqual([first!.id]);
    subject.recordCollection(first!.id, 'paid');
    expect(subject.isPeriodSettled(day('2026-11-06'))).toBe(true);
  });

  it('cada mes paga el payout neto a quien tiene el turno y termina después del último', () => {
    const subject = cycle();
    subject.start(newId);
    const payouts = [];
    for (const today of ['2026-11-05', '2026-12-05', '2027-01-05'].map(day)) {
      payAll(subject, today);
      payouts.push(subject.closePeriod(today, newId));
    }

    expect(payouts.map((payout) => [payout?.userId, payout?.period.toString()])).toEqual([
      ['ana', '2026-11'],
      ['beto', '2026-12'],
      ['caro', '2027-01'],
    ]);
    expect(payouts[0]?.amount).toEqual(member('ana', 1).quote.netPayout);
    expect(subject.disbursements).toHaveLength(3);
    expect(subject.state).toBe('finished');
    expect(subject.isFinished()).toBe(true);
    expect(subject.currentPeriod).toBeNull();
    expect(subject.dueInstallments(day('2027-02-05'))).toEqual([]);
  });

  /** Un círculo en noviembre, ya empezado, con estos miembros y sin cuotas abiertas. */
  const running = (members: CycleMember[]) =>
    CircleCycle.restore({
      circleId: 'c-1',
      terms: TERMS,
      dueDay: 5,
      delinquency: TEST_DELINQUENCY,
      fund: { balance: Money.zero('PEN'), feeShareBps: TEST_FUND_SHARE_BPS },
      state: 'contributing',
      currentPeriod: Period.of(2026, 11),
      members,
      installments: [],
    });

  it('un círculo incompleto no empieza: necesita la aprobación de sus miembros', () => {
    const subject = cycle([member('ana', 1), member('caro', 3)]);
    expect(subject.isStartDue(day('2026-11-01'))).toBe(true);
    expect(subject.missingMembers()).toBe(1);
    expect(() => subject.start(newId)).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    expect(subject.state).toBe('collecting');
    expect(cycle().missingMembers()).toBe(0);
  });

  it('no cierra un mes antes de su vencimiento, aunque no tenga cuotas', () => {
    const subject = running([]);
    expect(subject.isPeriodSettled(day('2026-11-04'))).toBe(false);
    expect(subject.isPeriodSettled(day('2026-11-05'))).toBe(true);
  });

  it('un turno libre no tiene payout', () => {
    const subject = running([member('beto', 2)]);
    expect(subject.receiver()).toBeUndefined();
    expect(subject.closePeriod(day('2026-11-05'), newId)).toBeNull();
    expect(subject.receiver()?.userId).toBe('beto');
  });

  describe('impago (COPAYNI-57)', () => {
    const quoteOf = (userId: string, position: number) => member(userId, position).quote;
    const sum = (amounts: readonly Money[]) =>
      amounts.reduce((total, amount) => total.add(amount), Money.zero('PEN'));

    /** Paga noviembre completo y en diciembre falla el cobro de `userId`. */
    function failInDecember(userId: string) {
      const subject = cycle();
      subject.start(newId);
      payAll(subject, day('2026-11-05'));
      subject.closePeriod(day('2026-11-05'), newId);
      for (const installment of subject.dueInstallments(day('2026-12-05'))) {
        subject.recordCollection(installment.id, installment.userId === userId ? 'failed' : 'paid');
      }
      const unpaid = subject.installments.find(
        ({ userId: owner, status }) => owner === userId && status === 'overdue',
      )!;
      return { subject, unpaid };
    }

    it('expulsa al día siguiente de terminar los 3 días de gracia, y no antes', () => {
      const { subject, unpaid } = failInDecember('caro');
      expect(subject.defaultedInstallments(day('2026-12-08'))).toEqual([]);
      expect(subject.defaultedInstallments(day('2026-12-09')).map(({ id }) => id)).toEqual([
        unpaid.id,
      ]);
      expect(() => subject.expel(unpaid.id, day('2026-12-08'))).toThrow(
        expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
      );
    });

    it('la gracia cruza el cambio de mes y de año', () => {
      const subject = CircleCycle.restore({
        circleId: 'c-2',
        terms: CircleTerms.create({
          payout: Money.of(300_000, 'PEN'),
          months: 3,
          startsOn: Period.of(2026, 12),
        }),
        dueDay: 30,
        delinquency: TEST_DELINQUENCY,
        fund: { balance: Money.zero('PEN'), feeShareBps: TEST_FUND_SHARE_BPS },
        state: 'collecting',
        currentPeriod: null,
        members: [member('ana', 1), member('beto', 2), member('caro', 3)],
        installments: [],
      });
      subject.start(newId);
      const [installment] = subject.dueInstallments(day('2026-12-30'));
      subject.recordCollection(installment!.id, 'failed');
      expect(subject.defaultedInstallments(day('2027-01-02'))).toEqual([]);
      expect(subject.defaultedInstallments(day('2027-01-03'))).toHaveLength(1);
    });

    it('una cuota que nunca se intentó cobrar no expulsa', () => {
      const subject = cycle();
      subject.start(newId);
      expect(subject.defaultedInstallments(day('2026-11-30'))).toEqual([]);
    });

    it('antes de su turno: debe la cuota más la mora, recibe lo pagado menos 5 % y su turno queda libre', () => {
      const { subject, unpaid } = failInDecember('caro');
      const caro = quoteOf('caro', 3);
      const expulsion = subject.expel(unpaid.id, day('2026-12-09'));

      expect(expulsion).toEqual({
        retentionApplied: Money.zero('PEN'),
        userId: 'caro',
        position: 3,
        period: Period.of(2026, 12),
        expelledOn: day('2026-12-09'),
        overdue: caro.installments[1],
        lateFee: caro.installments[1]!.percentage(300),
        paid: caro.installments[0],
        refund: caro.installments[0]!.subtract(caro.installments[0]!.percentage(500)),
      });
      expect(subject.expulsions).toEqual([expulsion]);
      expect(subject.installments.find(({ id }) => id === unpaid.id)?.status).toBe('defaulted');
      expect(subject.dueInstallments(day('2026-12-09'))).toEqual([]);
      expect(() => subject.recordCollection(unpaid.id, 'paid')).toThrow(
        expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
      );
      expect(subject.members.map(({ userId }) => userId)).toEqual(['ana', 'beto']);

      // El mes cierra con la cuota incobrable; el fondo la cubre (COPAYNI-58).
      expect(subject.closePeriod(day('2026-12-09'), newId)?.userId).toBe('beto');
      expect(
        subject.installments
          .filter(({ period }) => period.equals(Period.of(2027, 1)))
          .map(({ userId }) => userId),
      ).toEqual(['ana', 'beto']);
      payAll(subject, day('2027-01-05'));
      expect(subject.closePeriod(day('2027-01-05'), newId)).toBeNull();
      expect(subject.isFinished()).toBe(true);
    });

    it('después de cobrar: debe sus cuotas restantes más la mora y no hay devolución', () => {
      const { subject, unpaid } = failInDecember('ana');
      const ana = quoteOf('ana', 1);
      const expulsion = subject.expel(unpaid.id, day('2026-12-09'));

      expect(expulsion.overdue).toEqual(sum(ana.installments.slice(1)));
      expect(expulsion.lateFee).toEqual(ana.installments[1]!.percentage(300));
      expect(expulsion.refund).toBeNull();
      expect(expulsion.paid).toBeNull();
    });

    it('en su propio mes de cobro todavía no cobró: hay devolución y ese pozo no se paga', () => {
      const { subject, unpaid } = failInDecember('beto');
      const expulsion = subject.expel(unpaid.id, day('2026-12-09'));
      expect(expulsion.refund).not.toBeNull();
      expect(subject.receiver()).toBeUndefined();
      expect(subject.closePeriod(day('2026-12-09'), newId)).toBeNull();
    });
  });

  it('rechaza transiciones y estados inconsistentes', () => {
    const subject = cycle();
    subject.start(newId);
    expect(() => subject.start(newId)).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    const [installment] = subject.dueInstallments(day('2026-11-05'));
    subject.recordCollection(installment!.id, 'paid');
    expect(() => subject.recordCollection(installment!.id, 'paid')).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    expect(() => subject.recordCollection('inventada', 'paid')).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );

    const restore = (
      state: 'collecting' | 'contributing' | 'finished' | 'paused',
      period: Period | null,
    ) =>
      CircleCycle.restore({
        circleId: 'c-1',
        terms: TERMS,
        dueDay: 5,
        delinquency: TEST_DELINQUENCY,
        fund: { balance: Money.zero('PEN'), feeShareBps: TEST_FUND_SHARE_BPS },
        state,
        currentPeriod: period,
        members: [],
        installments: [],
        pausedOn: state === 'paused' ? day('2026-11-02') : null,
      });
    expect(() =>
      CircleCycle.restore({
        circleId: 'c-1',
        terms: TERMS,
        dueDay: 5,
        delinquency: TEST_DELINQUENCY,
        fund: { balance: Money.zero('USD'), feeShareBps: TEST_FUND_SHARE_BPS },
        state: 'collecting',
        currentPeriod: null,
        members: [],
        installments: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }));
    expect(() => restore('contributing', null)).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    expect(() => restore('finished', Period.of(2026, 11))).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    expect(restore('paused', Period.of(2026, 11)).dueInstallments(day('2026-11-05'))).toEqual([]);
    // Un círculo pausado sigue en curso: tiene mes en curso y fecha de pausa (COPAYNI-61).
    expect(() => restore('paused', null)).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    expect(() =>
      CircleCycle.restore({
        circleId: 'c-1',
        terms: TERMS,
        dueDay: 5,
        delinquency: TEST_DELINQUENCY,
        fund: { balance: Money.zero('PEN'), feeShareBps: TEST_FUND_SHARE_BPS },
        state: 'contributing',
        currentPeriod: Period.of(2026, 11),
        members: [],
        installments: [],
        pausedOn: day('2026-11-02'),
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }));
  });
});
