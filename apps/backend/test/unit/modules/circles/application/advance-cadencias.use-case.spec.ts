import { Logger } from '@nestjs/common';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';

/**
 * La tarea diaria del ciclo con una junta semanal (COPAYNI-126), de punta a punta: cuatro turnos
 * dentro del mismo mes, con el doble de persistencia imitando las unicidades por turno que la
 * expansión creó en PostgreSQL (COPAYNI-107).
 */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

/** 12.000 en 4 turnos semanales desde el miércoles 4 de noviembre: cuota base de 3.000. */
const WEEKLY = CircleTerms.create({
  payout: Money.of(1_200_000, 'PEN'),
  turns: 4,
  cadence: Cadence.weekly,
  startsOn: LocalDate.parse('2026-11-04'),
});

const SETTINGS = {
  dueDay: 5,
  timeZone: 'America/Lima',
  delinquency: TEST_DELINQUENCY,
  fundFeeShareBps: TEST_FUND_SHARE_BPS,
  startApprovalDays: 7,
};

function setup(positions: number[] = [1, 2, 3, 4]) {
  const cycles = new InMemoryCircleCycleRepository();
  cycles.add({
    circleId: 'c-1',
    terms: WEEKLY,
    state: 'collecting',
    currentPeriod: null,
    members: positions.map((position) => ({
      userId: `u-${position}`,
      position,
      price: priceOf(TEST_PRICING.quote(WEEKLY, position)),
    })),
    installments: [],
  });
  const clock = new TestClock(at('2026-11-04'));
  const payments = new FakeCyclePayments();
  const advance = new AdvanceCircleCyclesUseCase(
    cycles,
    TEST_PRICING,
    SETTINGS,
    payments,
    payments,
    clock,
  );
  return { cycles, clock, advance };
}

/** Vencimientos guardados del primer turno, que es el que fija la fecha de arranque. */
const dueDatesOfTurnOne = (cycles: InMemoryCircleCycleRepository): string[] =>
  [...cycles.installments.values()]
    .filter(({ turn }) => turn === 1)
    .map(({ dueOn }) => dueOn.toString());

describe('La tarea diaria con una junta semanal (COPAYNI-126)', () => {
  beforeEach(() => {
    for (const level of ['log', 'warn', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('cierra los cuatro turnos del mes y paga a los cuatro miembros, uno por turno', async () => {
    const { cycles, clock, advance } = setup();
    for (const date of ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']) {
      clock.set(at(date));
      await expect(advance.execute()).resolves.toEqual({ advanced: 1, locked: 0, failed: 0 });
    }

    // Antes, el primer cierre pagaba al turno 1 y declaraba terminada la junta: los otros tres
    // habían pagado su cuota y no cobraban nunca.
    expect(cycles.payouts.map(({ turn, userId }) => [turn, userId])).toEqual([
      [1, 'u-1'],
      [2, 'u-2'],
      [3, 'u-3'],
      [4, 'u-4'],
    ]);
    for (const { amount } of cycles.payouts) expect(amount.isPositive()).toBe(true);
    expect(cycles.get('c-1')).toMatchObject({ state: 'finished', currentTurn: null });

    // Cuatro cuotas por miembro, una por turno: con el mes como clave, las cuatro de cada uno
    // habrían sido la misma fila.
    expect(cycles.installments.size).toBe(16);
    expect(
      [...cycles.installments.values()]
        .filter(({ userId }) => userId === 'u-1')
        .map(({ turn }) => turn),
    ).toEqual([1, 2, 3, 4]);

    // El pozo cierra en cero en cada turno: nadie aportó a un turno que no se repartió.
    expect(cycles.balance('circle_pot').isZero()).toBe(true);
  });

  it('una junta semanal incompleta arranca reducida sin perder su cadencia', async () => {
    // Faltando un miembro, el círculo no empieza: propone reducirse y espera (R2, COPAYNI-62).
    const { cycles, advance } = setup([1, 2, 3]);
    await advance.execute();
    expect(cycles.get('c-1')?.state).toBe('approving');

    for (const position of [1, 2, 3]) cycles.respond('c-1', `u-${position}`, 'accepted');
    await advance.execute();

    const stored = cycles.get('c-1')!;
    expect(stored.state).toBe('contributing');
    // Reducirse cambia cuántos son y el pozo, no cada cuánto pagan: antes la junta reducida
    // volvía a ser mensual en silencio.
    expect(stored.terms.cadence.id).toBe('weekly');
    expect(stored.terms.turns).toBe(3);
    expect(stored.terms.payout.amount).toBe(900_000);
    expect(stored.terms.startsOn.toString()).toBe('2026-11-04');
    // Arrancó y cerró su primer turno el mismo día, porque vencía ese día.
    expect(dueDatesOfTurnOne(cycles)).toEqual(['2026-11-04', '2026-11-04', '2026-11-04']);
    expect(cycles.payouts.map(({ turn, userId }) => [turn, userId])).toEqual([[1, 'u-1']]);
    expect(stored).toMatchObject({ currentTurn: 2 });
  });

  it('si el primer vencimiento semanal ya pasó, arranca ahora y no un mes después', async () => {
    const { cycles, clock, advance } = setup([1, 2, 3]);
    await advance.execute();
    for (const position of [1, 2, 3]) cycles.respond('c-1', `u-${position}`, 'accepted');
    clock.set(at('2026-11-06'));
    await advance.execute();

    const stored = cycles.get('c-1')!;
    // El retraso se mide contra el vencimiento del turno, que en cadencia semanal es el día de
    // arranque. Correrlo al día de cobro del mes siguiente habría retrasado la junta un mes.
    expect(stored.terms.startsOn.toString()).toBe('2026-11-06');
    expect(dueDatesOfTurnOne(cycles)).toEqual(['2026-11-06', '2026-11-06', '2026-11-06']);
  });

  it('volver a correrla el mismo día no duplica el payout del turno', async () => {
    const { cycles, clock, advance } = setup();
    clock.set(at('2026-11-04'));
    await advance.execute();
    const after = cycles.payouts.length;
    await advance.execute();

    expect(after).toBe(1);
    expect(cycles.payouts).toHaveLength(1);
    expect(cycles.get('c-1')).toMatchObject({ currentTurn: 2 });
  });
});
