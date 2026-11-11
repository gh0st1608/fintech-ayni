import { type MyCircleCalendar } from '@src/modules/circles/application/ports/my-circle-calendar.port';
import { type PaymentsQueryPort } from '@src/modules/circles/application/ports/payments-query.port';
import {
  abbreviatedName,
  GetMyCircleUseCase,
} from '@src/modules/circles/application/use-cases/get-my-circle.use-case';
import { Circle, type Membership } from '@src/modules/circles/domain/entities/circle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import { TEST_PRICING } from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const ANA = { userId: 'u-4', subject: 'u-4', roles: [] } as never;

/** 30.000 en 10 meses desde noviembre de 2026, con el turno 7 vacante. */
const TERMS = CircleTerms.create({
  payout: pen(30_000),
  months: 10,
  startsOn: Period.of(2026, 11),
});

function setup(
  calendar: Partial<MyCircleCalendar> = {},
  dues: PaymentsQueryPort['dueInstallmentsOf'] = () => Promise.resolve([]),
) {
  const circles = new InMemoryCircleRepository();
  const memberships: Membership[] = [1, 2, 3, 4, 5, 6, 8, 9, 10].map((position) => ({
    userId: `u-${position}`,
    position,
    idempotencyKey: `key-u-${position}-000000`,
    price: priceOf(TEST_PRICING.quote(TERMS, position)),
  }));
  circles.add(
    Circle.restore({ id: 'c-1', terms: TERMS, memberships, running: { vacancies: [7] } }),
  );
  const names: Record<number, [string | null, string | null]> = {
    1: ['María José', 'Rojas'],
    2: ['Luis', 'tapia'],
    3: [null, null],
  };
  const members = memberships.map(({ userId, position }) => ({
    userId,
    position,
    firstName: position in names ? names[position]![0] : `Socio${position}`,
    lastName: position in names ? names[position]![1] : null,
  }));
  const useCase = new GetMyCircleUseCase(
    circles,
    {
      find: (id) =>
        Promise.resolve(
          id === 'c-1'
            ? {
                state: 'contributing',
                currentPeriod: '2027-01',
                members,
                paidPeriods: ['2026-11', '2026-12'],
                ...calendar,
              }
            : null,
        ),
    },
    { dueInstallmentsOf: dues } as PaymentsQueryPort,
    TEST_PRICING,
  );
  return useCase;
}

describe('Detalle de mi círculo (COPAYNI-88)', () => {
  it('muestra el pozo, el mes en curso, mi turno y los turnos con su estado', async () => {
    const detail = await setup().execute(ANA, 'c-1');
    expect(detail).toMatchObject({
      circleId: 'c-1',
      state: 'contributing',
      currentMonth: 3,
      quote: { position: 4, payoutPeriod: Period.of(2027, 2) },
      nextDue: null,
    });
    expect(detail.currentPeriod?.toString()).toBe('2027-01');
    expect(detail.turns.map(({ position, status }) => `${position}:${status}`)).toEqual([
      '1:paid',
      '2:paid',
      '3:current',
      '4:upcoming',
      '5:upcoming',
      '6:upcoming',
      '7:vacant',
      '8:upcoming',
      '9:upcoming',
      '10:upcoming',
    ]);
    expect(detail.turns[3]).toMatchObject({ isMe: true, period: Period.of(2027, 2) });
    expect(detail.turns.filter(({ isMe }) => isMe)).toHaveLength(1);
  });

  it('abrevia los nombres de los demás miembros (privacidad, L3)', async () => {
    const { turns } = await setup().execute(ANA, 'c-1');
    expect(turns.slice(0, 3).map(({ memberName }) => memberName)).toEqual([
      'María R.',
      'Luis T.',
      null,
    ]);
    expect(turns[6]?.memberName).toBeNull();
    expect(abbreviatedName({ userId: 'x', position: 1, firstName: 'Ana', lastName: null })).toBe(
      'Ana',
    );
  });

  it('antes de empezar no hay mes en curso y trae mi próxima cuota de ese círculo', async () => {
    const due = {
      installmentId: 'i-1',
      circleId: 'c-1',
      period: Period.of(2026, 11),
      dueOn: LocalDate.parse('2026-11-05'),
      amount: pen(3_000),
      status: 'pending' as const,
      position: 4,
      slots: 10,
      payout: pen(30_000),
    };
    const other = { ...due, installmentId: 'i-2', circleId: 'c-2' };
    const detail = await setup({ state: 'collecting', currentPeriod: null, paidPeriods: [] }, () =>
      Promise.resolve([other, due]),
    ).execute(ANA, 'c-1');
    expect(detail.currentMonth).toBeNull();
    expect(detail.nextDue?.installmentId).toBe('i-1');
    expect(detail.turns.every(({ status }) => status === 'upcoming' || status === 'vacant')).toBe(
      true,
    );
  });

  it('a quien no es miembro (o al expulsado) le responde CIRCLE_NOT_FOUND', async () => {
    const useCase = setup();
    const stranger = { userId: 'u-7', subject: 'u-7', roles: [] } as never;
    await expect(useCase.execute(stranger, 'c-1')).rejects.toMatchObject({
      code: 'CIRCLE_NOT_FOUND',
    });
    await expect(useCase.execute(ANA, 'c-otro')).rejects.toMatchObject({
      code: 'CIRCLE_NOT_FOUND',
    });
  });
});
