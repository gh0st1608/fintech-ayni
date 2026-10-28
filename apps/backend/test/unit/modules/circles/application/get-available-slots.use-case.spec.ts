import {
  type CircleAssignmentSettings,
  GetAvailableSlotsUseCase,
} from '@src/modules/circles/application/use-cases/get-available-slots.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const ANA = { userId: 'ana' };

/** Los valores por defecto de la configuración (iguales al adaptador falso de mobile). */
const PRICING = new SlotPricing(
  SlotPricingRules.create({
    fastestShareBps: 2_500,
    highestShareBps: 2_500,
    maxFeeBps: 1_000,
    maxDiscountBps: 500,
    adminFeeBps: 1_200,
    adminFeeMode: 'added_to_installments',
  }),
);

const JOIN_CONFIG = JoinConfig.create({
  payoutRange: PayoutRange.create({ min: pen(3_000), max: pen(120_000), step: pen(500) }),
  savingProgramMax: pen(1_000_000),
  userPayoutLimit: null,
  durationOptions: [6, 10, 12],
});

/** 2026-11-01 03:00 UTC: en Lima todavía es 31 de octubre. */
const NOW = new Date('2026-11-01T03:00:00Z');

function setup(settings: Partial<CircleAssignmentSettings> = {}) {
  const circles = new InMemoryCircleRepository();
  const useCase = new GetAvailableSlotsUseCase(
    { getForUser: () => Promise.resolve(JOIN_CONFIG) },
    circles,
    PRICING,
    { strategy: 'fill_oldest', startOffsetMonths: 1, timeZone: 'America/Lima', ...settings },
    new TestClock(NOW),
  );
  const addCircle = (
    id: string,
    props: { months?: number; startsOn?: Period; members?: [string, number][] } = {},
  ) =>
    circles.add(
      Circle.restore({
        id,
        terms: CircleTerms.create({
          payout: pen(30_000),
          months: props.months ?? 10,
          startsOn: props.startsOn ?? Period.of(2026, 12),
        }),
        memberships: (props.members ?? []).map(([userId, position]) => ({
          userId,
          position,
          idempotencyKey: `k-${userId}`,
        })),
      }),
    );
  return { useCase, addCircle };
}

const slotsOf = (useCase: GetAvailableSlotsUseCase, months = 10) =>
  useCase.execute(ANA, 3_000_000, months);

describe('GetAvailableSlotsUseCase', () => {
  it('sin círculos abiertos ofrece uno nuevo que empieza el mes siguiente en la zona del negocio', async () => {
    const result = await slotsOf(setup().useCase);

    expect(result.circleId).toBeNull();
    // En Lima es octubre: empieza en noviembre, aunque en UTC ya sea noviembre.
    expect(result.terms.startsOn.toString()).toBe('2026-11');
    expect(result.slots.every(({ available }) => available)).toBe(true);
  });

  it('aplica el precio configurado, igual que el adaptador falso de mobile', async () => {
    const { slots } = await slotsOf(setup().useCase);

    expect(slots.map(({ type }) => type)).toEqual([
      ...Array<string>(2).fill('fastest_payout'),
      ...Array<string>(6).fill('lowest_fees'),
      ...Array<string>(2).fill('highest_return'),
    ]);
    expect(slots.map(({ fee }) => fee.amount / 100)).toEqual([
      3_000, 1_500, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(slots.map(({ discount }) => discount.amount / 100)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 750, 1_500,
    ]);
    expect(slots[0]?.payoutPeriod.toString()).toBe('2026-11');
  });

  it('fill_oldest completa el círculo abierto más antiguo y marca los slots ocupados', async () => {
    const { useCase, addCircle } = setup();
    addCircle('c-oldest', {
      startsOn: Period.of(2027, 1),
      members: [
        ['beto', 1],
        ['caro', 9],
      ],
    });
    addCircle('c-newer', { members: [['dani', 2]] });

    const result = await slotsOf(useCase);

    expect(result.circleId).toBe('c-oldest');
    expect(result.terms.startsOn.toString()).toBe('2027-01');
    expect(
      result.slots.filter(({ available }) => !available).map(({ position }) => position),
    ).toEqual([1, 9]);
  });

  it('salta los círculos que ya empezaron, están llenos, tienen otras condiciones o donde ya es miembro', async () => {
    const { useCase, addCircle } = setup();
    addCircle('c-started', { startsOn: Period.of(2026, 10) });
    addCircle('c-full', {
      months: 6,
      members: ['a', 'b', 'c', 'd', 'e', 'f'].map((user, index) => [user, index + 1]),
    });
    addCircle('c-other-months', { months: 12 });
    addCircle('c-member', { members: [['ana', 3]] });
    addCircle('c-joinable');

    expect((await slotsOf(useCase)).circleId).toBe('c-joinable');
    expect((await slotsOf(useCase, 6)).circleId).toBeNull();
  });

  it('always_new ignora los círculos abiertos y respeta el desfase configurado', async () => {
    const { useCase, addCircle } = setup({ strategy: 'always_new', startOffsetMonths: 2 });
    addCircle('c-joinable');

    const result = await slotsOf(useCase);
    expect(result.circleId).toBeNull();
    expect(result.terms.startsOn.toString()).toBe('2026-12');
  });

  it('rechaza una duración no ofrecida y un payout fuera del rango', async () => {
    const { useCase } = setup();
    await expect(useCase.execute(ANA, 3_000_000, 7)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { months: 'not_offered' },
    });
    await expect(useCase.execute(ANA, 3_000_050, 10)).rejects.toMatchObject({
      code: 'PAYOUT_NOT_ALLOWED',
    });
  });
});

describe('Period.fromDate', () => {
  it('usa la zona horaria pedida para el mes calendario', () => {
    expect(Period.fromDate(NOW, 'America/Lima').toString()).toBe('2026-10');
    expect(Period.fromDate(NOW, 'UTC').toString()).toBe('2026-11');
    expect(Period.of(2026, 11).isAfter(Period.of(2026, 10))).toBe(true);
    expect(Period.of(2026, 10).isAfter(Period.of(2026, 10))).toBe(false);
  });
});
