import { Logger } from '@nestjs/common';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import {
  type CircleCycleSettings,
  delinquencyByCadenceFrom,
  delinquencyFor,
} from '@src/modules/circles/application/use-cases/cycle-settings';
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
 * Morosidad y gracia por cadencia (COPAYNI-111).
 *
 * Los valores actuales están calibrados para un ciclo mensual. El problema no es el solape —con 3
 * días de gracia no hay solape ni en una junta semanal— sino la frecuencia: 52 ocasiones anuales
 * de incurrir en mora en lugar de 12, y un cargo del 3 % aplicado 52 veces al año sobre el mismo
 * capital. Aquí entra la estructura; los valores los decide riesgo y finanzas (COPAYNI-102).
 */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

/** 12.000 en 4 turnos semanales desde el miércoles 4 de noviembre. */
const WEEKLY = CircleTerms.create({
  payout: Money.of(1_200_000, 'PEN'),
  turns: 4,
  cadence: Cadence.weekly,
  startsOn: LocalDate.parse('2026-11-04'),
});

const SETTINGS: CircleCycleSettings = {
  dueDay: 5,
  timeZone: 'America/Lima',
  delinquency: TEST_DELINQUENCY,
  // Una junta semanal con un solo día de gracia, en lugar de los 3 de la mensual.
  delinquencyByCadence: { weekly: { ...TEST_DELINQUENCY, graceDays: 1, lateFeeBps: 150 } },
  fundFeeShareBps: TEST_FUND_SHARE_BPS,
  startApprovalDays: 7,
};

function setup(settings: CircleCycleSettings) {
  const cycles = new InMemoryCircleCycleRepository();
  cycles.add({
    circleId: 'c-1',
    terms: WEEKLY,
    state: 'collecting',
    currentPeriod: null,
    members: [1, 2, 3, 4].map((position) => ({
      userId: `u-${position}`,
      position,
      price: priceOf(TEST_PRICING.quote(WEEKLY, position)),
    })),
    installments: [],
  });
  const clock = new TestClock(at('2026-11-04'));
  // Ningún cobro funciona: todas las cuotas quedan vencidas y empieza a correr la gracia.
  const failing = { collect: () => Promise.resolve('failed' as const) };
  const payments = new FakeCyclePayments();
  const advance = new AdvanceCircleCyclesUseCase(
    cycles,
    TEST_PRICING,
    settings,
    failing,
    payments,
    clock,
  );
  return { cycles, clock, advance };
}

describe('Morosidad por cadencia (COPAYNI-111)', () => {
  beforeEach(() => {
    for (const level of ['log', 'warn', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('resuelve la política de cada cadencia, y la mensual es la de siempre', () => {
    expect(delinquencyFor(SETTINGS, Cadence.monthly)).toEqual(TEST_DELINQUENCY);
    expect(delinquencyFor(SETTINGS, Cadence.weekly)).toMatchObject({
      graceDays: 1,
      lateFeeBps: 150,
    });
    // Sin política propia se usa la mensual: es lo que ocurre hoy y lo que la validación de
    // entorno impide para una cadencia habilitada.
    expect(delinquencyFor(SETTINGS, Cadence.biweekly)).toEqual(TEST_DELINQUENCY);
  });

  it('una junta semanal expulsa con su gracia, no con la de la mensual', async () => {
    const { cycles, clock, advance } = setup(SETTINGS);
    await advance.execute();

    // Vence el 4 con 1 día de gracia: el 5 todavía se puede pagar y el 6 se expulsa.
    clock.set(at('2026-11-05'));
    await advance.execute();
    expect(cycles.expulsions).toHaveLength(0);

    clock.set(at('2026-11-06'));
    await advance.execute();
    expect(cycles.expulsions).toHaveLength(4);
    // Y con el cargo por mora de la cadencia semanal: 1,5 % de la cuota, no el 3 %.
    const [first] = cycles.expulsions;
    expect(first!.lateFee.amount).toBe(first!.overdue.percentage(150).amount);
  });

  it('con la política mensual, la misma junta aguantaría hasta el 8', async () => {
    // La diferencia es el ticket: aplicarle los 3 días de la mensual a un ciclo de 7 alarga la
    // gracia a casi la mitad del ciclo.
    const { cycles, clock, advance } = setup({ ...SETTINGS, delinquencyByCadence: {} });
    await advance.execute();

    clock.set(at('2026-11-06'));
    await advance.execute();
    expect(cycles.expulsions).toHaveLength(0);

    clock.set(at('2026-11-08'));
    await advance.execute();
    expect(cycles.expulsions).toHaveLength(4);
  });

  it('las listas de entorno se convierten en políticas por cadencia', () => {
    expect(
      delinquencyByCadenceFrom({
        graceDays: ['weekly:1', 'biweekly:2'],
        lateFeeBps: ['weekly:150', 'biweekly:200'],
        refundPenaltyBps: 500,
      }),
    ).toEqual({
      weekly: { graceDays: 1, lateFeeBps: 150, refundPenaltyBps: 500 },
      biweekly: { graceDays: 2, lateFeeBps: 200, refundPenaltyBps: 500 },
    });
    // Una cadencia con gracia pero sin mora no se arma a medias; la validación de entorno no deja
    // habilitarla, y aquí tampoco se inventa el valor que falta.
    expect(
      delinquencyByCadenceFrom({
        graceDays: ['weekly:1'],
        lateFeeBps: [],
        refundPenaltyBps: 500,
      }),
    ).toEqual({});
  });
});
