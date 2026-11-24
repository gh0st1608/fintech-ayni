import {
  type CircleAssignmentSettings,
  GetAvailableSlotsUseCase,
} from '@src/modules/circles/application/use-cases/get-available-slots.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { nextStart } from '@src/modules/circles/domain/services/circle-start';
import { SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import { ELIGIBLE, historyWith, TEST_TRUST } from '@test/support/join-circle.fixture';

/**
 * La cadencia en la clave de emparejamiento (COPAYNI-114).
 *
 * Es el riesgo de regresión más serio de la épica. `fill_oldest` ofrece el círculo abierto más
 * antiguo que coincide en pozo, turnos y moneda; sin la cadencia en esa clave, en cuanto exista un
 * solo círculo semanal en la base, quien pide una junta mensual puede acabar en él y comprometerse
 * a pagar cuatro veces más a menudo de lo que aceptó. El fallo es silencioso: la unión funciona, y
 * lo que cambia es el calendario de su dinero.
 */
const pen = (major: number) => Money.of(major * 100, 'PEN');
const ANA = { userId: 'ana' };
const BOTH = [Cadence.monthly, Cadence.weekly];

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

/** 2026-10-15 15:00 UTC: en Lima son las 10 de la mañana del 15 de octubre. */
const NOW = new Date('2026-10-15T15:00:00Z');
const TODAY = LocalDate.parse('2026-10-15');

function setup(settings: Partial<CircleAssignmentSettings> = {}) {
  const circles = new InMemoryCircleRepository();
  const useCase = new GetAvailableSlotsUseCase(
    { getForUser: () => Promise.resolve(JOIN_CONFIG) },
    circles,
    PRICING,
    {
      strategy: 'fill_oldest',
      cadences: [Cadence.monthly],
      startOffsetMonths: 1,
      timeZone: 'America/Lima',
      ...settings,
    },
    { dueDay: 5 },
    { applicantFor: () => Promise.resolve(ELIGIBLE) },
    historyWith(1),
    TEST_TRUST,
    new TestClock(NOW),
  );
  /** Un círculo abierto de 10 turnos y 30.000, con la cadencia indicada. */
  const addCircle = (id: string, cadence: Cadence) =>
    circles.add(
      Circle.open({
        id,
        terms: CircleTerms.create({
          payout: pen(30_000),
          turns: 10,
          cadence,
          startsOn: nextStart(TODAY, cadence, 1),
        }),
      }),
    );
  return { useCase, addCircle };
}

describe('Emparejamiento por cadencia (COPAYNI-114)', () => {
  it('quien pide mensual no recibe el único círculo abierto semanal', async () => {
    const { useCase, addCircle } = setup({ cadences: BOTH });
    addCircle('c-semanal', Cadence.weekly);

    const result = await useCase.execute(ANA, 3_000_000, 10);

    // Sin la cadencia en la clave, aquí se devolvía «c-semanal» y la persona se unía a él.
    expect(result.circleId).toBeNull();
    expect(result.terms.cadence.equals(Cadence.monthly)).toBe(true);
    expect(result.terms.startsOn.toString()).toBe('2026-11-01');
  });

  it('quien pide semanal recibe el círculo semanal abierto que coincide', async () => {
    const { useCase, addCircle } = setup({ cadences: BOTH });
    addCircle('c-semanal', Cadence.weekly);
    addCircle('c-mensual', Cadence.monthly);

    const result = await useCase.execute(ANA, 3_000_000, 10, undefined, undefined, 'weekly');

    expect(result.circleId).toBe('c-semanal');
    expect(result.terms.cadence.equals(Cadence.weekly)).toBe(true);
  });

  it('con solo círculos mensuales el emparejamiento es el de siempre', async () => {
    const { useCase, addCircle } = setup();
    addCircle('c-mensual', Cadence.monthly);

    await expect(useCase.execute(ANA, 3_000_000, 10)).resolves.toMatchObject({
      circleId: 'c-mensual',
    });
  });

  it('entre dos círculos de la misma cadencia sigue ganando el más antiguo', async () => {
    const { useCase, addCircle } = setup({ cadences: BOTH });
    addCircle('c-semanal-vieja', Cadence.weekly);
    addCircle('c-semanal-nueva', Cadence.weekly);

    const result = await useCase.execute(ANA, 3_000_000, 10, undefined, undefined, 'weekly');

    expect(result.circleId).toBe('c-semanal-vieja');
  });

  it('no ofrece slots de una cadencia que no está habilitada', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute(ANA, 3_000_000, 10, undefined, undefined, 'weekly'),
    ).rejects.toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', details: { cadence: 'not_enabled' } }),
    );
  });

  it('una junta semanal nueva arranca la semana siguiente, no el mes siguiente', async () => {
    // `CIRCLE_START_OFFSET_MONTHS = 1` se lee como un paso de la cadencia: esperar un mes para
    // empezar una junta de cuatro semanas sería esperar más que lo que la junta dura.
    const { useCase } = setup({ cadences: BOTH });

    const weekly = await useCase.execute(ANA, 3_000_000, 10, undefined, undefined, 'weekly');

    expect(weekly.terms.startsOn.toString()).toBe('2026-10-22');
  });

  it('nextStart cuenta en la unidad de cada cadencia', () => {
    expect(nextStart(TODAY, Cadence.monthly, 1).toString()).toBe('2026-11-01');
    expect(nextStart(TODAY, Cadence.monthly, 2).toString()).toBe('2026-12-01');
    expect(nextStart(TODAY, Cadence.biweekly, 1).toString()).toBe('2026-10-29');
    expect(nextStart(TODAY, Cadence.weekly, 1).toString()).toBe('2026-10-22');
    expect(nextStart(TODAY, Cadence.weekly, 0).toString()).toBe('2026-10-15');
  });
});
