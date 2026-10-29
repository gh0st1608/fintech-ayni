import { CircleCycle, type CycleMember } from '@src/modules/circles/domain/entities/circle-cycle';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TEST_PRICING } from '@test/support/join-circle.fixture';

/** Payout de 3.000 en 3 meses desde noviembre de 2026; vence el día 5. */
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

function cycle(members: CycleMember[] = [member('ana', 1), member('beto', 2), member('caro', 3)]) {
  return CircleCycle.restore({
    circleId: 'c-1',
    terms: TERMS,
    dueDay: 5,
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

  it('no cierra un mes antes de su vencimiento, aunque no tenga cuotas', () => {
    const subject = cycle([]);
    subject.start(newId);
    expect(subject.isPeriodSettled(day('2026-11-04'))).toBe(false);
    expect(subject.isPeriodSettled(day('2026-11-05'))).toBe(true);
  });

  it('un turno libre no tiene payout', () => {
    const subject = cycle([member('beto', 2)]);
    subject.start(newId);
    payAll(subject, day('2026-11-05'));
    expect(subject.receiver()).toBeUndefined();
    expect(subject.closePeriod(day('2026-11-05'), newId)).toBeNull();
    expect(subject.receiver()?.userId).toBe('beto');
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
        state,
        currentPeriod: period,
        members: [],
        installments: [],
      });
    expect(() => restore('contributing', null)).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    expect(() => restore('finished', Period.of(2026, 11))).toThrow(
      expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }),
    );
    expect(restore('paused', Period.of(2026, 11)).dueInstallments(day('2026-11-05'))).toEqual([]);
    expect(restore('paused', null).isStartDue(day('2027-01-01'))).toBe(false);
  });
});
