import { Logger } from '@nestjs/common';

import { GetAvailableSlotsUseCase } from '@src/modules/circles/application/use-cases/get-available-slots.use-case';
import { type JoinCircleCommand } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { ListRecommendedCirclesUseCase } from '@src/modules/circles/application/use-cases/list-recommended-circles.use-case';
import { Circle, type Membership } from '@src/modules/circles/domain/entities/circle';
import { catchUpTotal, priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { joinQuote, vacancyJoinMonth } from '@src/modules/circles/domain/services/vacancy';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import {
  createJoinCircleUseCase,
  ELIGIBLE,
  TEST_DUE_DAY,
  TEST_JOIN_CONFIG,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const day = (value: string) => LocalDate.parse(value);
/** Mediodía en Lima (UTC-5) del día indicado. */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

/** El círculo de pending-scope §3.1: 30.000 en 10 meses desde noviembre de 2026. */
const TERMS = CircleTerms.create({
  payout: pen(30_000),
  months: 10,
  startsOn: Period.of(2026, 11),
});

/** En curso, con el turno 7 vacante: su miembro fue expulsado antes de cobrar. */
function runningCircle(id = 'c-1', vacancies = [7]): Circle {
  const memberships: Membership[] = Array.from({ length: 10 }, (_, index) => index + 1)
    .filter((position) => !vacancies.includes(position))
    .map((position) => ({
      userId: `u-${position}`,
      position,
      idempotencyKey: `key-u-${position}-000000`,
      price: priceOf(TEST_PRICING.quote(TERMS, position)),
    }));
  return Circle.restore({ id, terms: TERMS, memberships, running: { vacancies } });
}

describe('Precio de la vacante (COPAYNI-59)', () => {
  it('reparte la puesta al día y las Admin Fees hasta su mes de cobro', () => {
    // Turno 7 tomado en el mes 6 (índice 5): debe las cuotas base de los meses 1 a 5.
    const quote = TEST_PRICING.replacementQuote(TERMS, 7, 5);
    const regular = TEST_PRICING.quote(TERMS, 7);

    expect(catchUpTotal(quote)).toEqual(pen(15_000));
    // Admin Fees de 12 % (3.600) y puesta al día (15.000), en los meses 6 y 7.
    expect(quote.installments.map(({ amount }) => amount / 100)).toEqual([
      0, 0, 0, 0, 0, 12_300, 12_300, 3_000, 3_000, 3_000,
    ]);
    expect(quote.catchUp?.map(({ amount }) => amount / 100)).toEqual([
      0, 0, 0, 0, 0, 7_500, 7_500, 0, 0, 0,
    ]);
    // Mismo tipo de turno, fee, descuento y payout que el miembro original.
    expect(quote).toMatchObject({
      type: regular.type,
      fee: regular.fee,
      discount: regular.discount,
      netPayout: regular.netPayout,
      payoutPeriod: Period.of(2027, 5),
    });
    expect(quote.totalPaid).toEqual(regular.totalPaid);
    expect(regular.catchUp).toBeUndefined();
  });

  it('el descuento de un turno final se reparte entre las cuotas que quedan', () => {
    const regular = TEST_PRICING.quote(TERMS, 10);
    const quote = TEST_PRICING.replacementQuote(TERMS, 10, 4);
    expect(quote.installments.slice(0, 4).every((amount) => amount.isZero())).toBe(true);
    expect(quote.totalPaid).toEqual(regular.totalPaid);
  });

  it('no se puede tomar en su mes de cobro ya pasado ni antes de empezar', () => {
    for (const joinMonth of [0, 7, 8, 1.5]) {
      expect(() => TEST_PRICING.replacementQuote(TERMS, 7, joinMonth)).toThrow(
        expect.objectContaining({ code: 'VACANCY_CLOSED' }),
      );
    }
    expect(TEST_PRICING.replacementQuote(TERMS, 7, 6).installments[6]).toEqual(
      pen(3_000 + 3_600 + 18_000),
    );
  });
});

describe('Ventana de la vacante', () => {
  it.each<[string, number | null, string]>([
    ['2027-04-04', 5, 'antes del vencimiento: paga la cuota del mes'],
    ['2027-04-05', 6, 'desde el vencimiento: empieza el mes siguiente'],
    ['2027-05-04', 6, 'en su mes de cobro, antes del vencimiento'],
    ['2027-05-05', null, 'vencido su mes de cobro: ya no se ofrece'],
    ['2026-10-20', null, 'el círculo no empezó'],
  ])('%s → mes %s (%s)', (today, expected) => {
    expect(vacancyJoinMonth(TERMS, 7, day(today), TEST_DUE_DAY)).toBe(expected);
  });

  it('el precio para unirse rechaza un turno ocupado y una vacante cerrada', () => {
    const circle = runningCircle();
    expect(() => joinQuote(TEST_PRICING, circle, 6, day('2027-04-01'), 5)).toThrow(
      expect.objectContaining({ code: 'SLOT_TAKEN' }),
    );
    expect(() => joinQuote(TEST_PRICING, circle, 7, day('2027-05-05'), 5)).toThrow(
      expect.objectContaining({ code: 'VACANCY_CLOSED' }),
    );
    expect(circle.status).toBe('open');
    expect(runningCircle('c-2', []).status).toBe('full');
  });
});

describe('Unirse a una vacante', () => {
  const COMMAND: JoinCircleCommand = {
    userId: 'nuevo',
    circleId: 'c-1',
    payoutAmount: 3_000_000,
    months: 10,
    position: 7,
    idempotencyKey: 'key-nuevo-00000001',
  };

  function setup(now = at('2027-04-04'), applicant = ELIGIBLE) {
    const circles = new InMemoryCircleRepository();
    circles.add(runningCircle());
    const useCase = createJoinCircleUseCase(circles, { now, applicant });
    return { circles, useCase };
  }

  afterEach(() => jest.restoreAllMocks());

  it('toma el turno con la puesta al día y congela ese precio', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { circles, useCase } = setup();

    const result = await useCase.execute(COMMAND);
    expect(result.created).toBe(true);
    expect(catchUpTotal(result.quote)).toEqual(pen(15_000));
    expect(result.quote.netPayout).toEqual(pen(30_000));
    const stored = circles.membershipsOf('c-1').find(({ userId }) => userId === 'nuevo');
    expect(stored?.price?.catchUp).toEqual(result.quote.catchUp);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ replacement: true }));

    // Reintento con la misma clave: responde el precio congelado.
    const retry = await useCase.execute(COMMAND);
    expect(retry.created).toBe(false);
    expect(retry.quote.installments).toEqual(result.quote.installments);
  });

  it('dos usuarios no pueden tomar la misma vacante', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { circles, useCase } = setup();
    const results = await Promise.allSettled([
      useCase.execute(COMMAND),
      useCase.execute({ ...COMMAND, userId: 'otro', idempotencyKey: 'key-otro-000000001' }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'SLOT_TAKEN' }),
    });
    expect(circles.membershipsOf('c-1').filter(({ position }) => position === 7)).toHaveLength(1);
  });

  it('rechaza un turno ocupado, una vacante cerrada y una cuota sobre el límite', async () => {
    await expect(setup().useCase.execute({ ...COMMAND, position: 6 })).rejects.toMatchObject({
      code: 'SLOT_TAKEN',
    });
    await expect(setup(at('2027-05-05')).useCase.execute(COMMAND)).rejects.toMatchObject({
      code: 'VACANCY_CLOSED',
    });
    // La cuota con la puesta al día (12.300) supera un límite de 12.000.
    await expect(
      setup(at('2027-04-04'), { ...ELIGIBLE, monthlyPayInLimit: pen(12_000) }).useCase.execute(
        COMMAND,
      ),
    ).rejects.toMatchObject({ code: 'MONTHLY_LIMIT_EXCEEDED' });
  });

  it('un círculo que empezó sin estar en curso no admite miembros', async () => {
    const circles = new InMemoryCircleRepository();
    circles.add(Circle.open({ id: 'c-1', terms: TERMS }));
    const useCase = createJoinCircleUseCase(circles, { now: at('2027-04-04') });
    await expect(useCase.execute(COMMAND)).rejects.toMatchObject({
      code: 'CIRCLE_ALREADY_STARTED',
    });
  });
});

describe('Vacantes en slots y recomendados', () => {
  const assignment = {
    strategy: 'fill_oldest' as const,
    startOffsetMonths: 1,
    timeZone: 'America/Lima',
  };
  const joinConfigs = { getForUser: () => Promise.resolve(TEST_JOIN_CONFIG) };

  function setup(now: Date) {
    const circles = new InMemoryCircleRepository();
    circles.add(runningCircle());
    const clock = new TestClock(now);
    const cycle = { dueDay: TEST_DUE_DAY };
    return {
      circles,
      slots: new GetAvailableSlotsUseCase(
        joinConfigs,
        circles,
        TEST_PRICING,
        assignment,
        cycle,
        clock,
      ),
      recommended: new ListRecommendedCirclesUseCase(
        joinConfigs,
        circles,
        TEST_PRICING,
        assignment,
        { limit: 5 },
        cycle,
        clock,
      ),
    };
  }

  it('slots de un círculo en curso: solo la vacante abierta, con su puesta al día', async () => {
    const { slots } = setup(at('2027-04-04'));
    const result = await slots.execute({ userId: 'nuevo' }, 3_000_000, 10, 'c-1');

    expect(result.circleId).toBe('c-1');
    expect(
      result.slots.filter(({ available }) => available).map(({ position }) => position),
    ).toEqual([7]);
    expect(catchUpTotal(result.slots[6]!)).toEqual(pen(15_000));
    expect(catchUpTotal(result.slots[0]!)).toEqual(pen(0));
  });

  it('slots con circleId valida el círculo y al usuario', async () => {
    const { slots } = setup(at('2027-04-04'));
    await expect(slots.execute({ userId: 'nuevo' }, 3_000_000, 10, 'otro')).rejects.toMatchObject({
      code: 'CIRCLE_NOT_FOUND',
    });
    await expect(slots.execute({ userId: 'nuevo' }, 3_000_000, 12, 'c-1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(slots.execute({ userId: 'u-1' }, 3_000_000, 10, 'c-1')).rejects.toMatchObject({
      code: 'ALREADY_MEMBER',
    });
  });

  it('slots con circleId de un círculo sin empezar ofrece sus turnos libres', async () => {
    const { circles, slots } = setup(at('2026-10-15'));
    circles.add(
      Circle.open({
        id: 'futuro',
        terms: CircleTerms.create({ ...TERMS, startsOn: Period.of(2026, 12) }),
      }),
    );
    const result = await slots.execute({ userId: 'nuevo' }, 3_000_000, 10, 'futuro');
    expect(result.slots.every(({ available }) => available)).toBe(true);
    await expect(slots.execute({ userId: 'nuevo' }, 3_000_000, 10, 'c-1')).resolves.toMatchObject({
      circleId: 'c-1',
    });
  });

  it('los recomendados muestran la vacante con su mes de cobro mientras está abierta', async () => {
    const open = await setup(at('2027-04-04')).recommended.execute({ userId: 'nuevo' });
    expect(open).toEqual([
      expect.objectContaining({
        circleId: 'c-1',
        availableSlots: 1,
        vacancies: [{ position: 7, payoutPeriod: Period.of(2027, 5) }],
      }),
    ]);

    expect(await setup(at('2027-05-05')).recommended.execute({ userId: 'nuevo' })).toEqual([]);
    // Un miembro del círculo no la ve.
    expect(await setup(at('2027-04-04')).recommended.execute({ userId: 'u-1' })).toEqual([]);
  });
});
