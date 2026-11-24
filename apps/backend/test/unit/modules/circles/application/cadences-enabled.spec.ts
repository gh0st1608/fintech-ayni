import { Logger } from '@nestjs/common';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { type JoinCircleCommand } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import {
  createJoinCircleUseCase,
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';

/**
 * La bandera `CIRCLE_CADENCES_ENABLED` (COPAYNI-121): separa el despliegue del código de la
 * activación de la funcionalidad, para poder llevar la épica a producción sin exponer ninguna
 * cadencia nueva hasta que negocio, riesgo y legal cierren sus decisiones.
 *
 * La puerta está en la unión, que es donde se crea un círculo. El motor de ciclo no la consulta:
 * deshabilitar una cadencia impide crear juntas nuevas, no detiene las que están en curso.
 */
const COMMAND: JoinCircleCommand = {
  userId: 'ana',
  circleId: null,
  payoutAmount: 3_000_000,
  months: 10,
  position: 3,
  idempotencyKey: 'key-ana-0000000001',
  termsVersion: '2026-11',
};

describe('Cadencias habilitadas (COPAYNI-121)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('con el valor por defecto solo se crean juntas mensuales', async () => {
    const circles = new InMemoryCircleRepository();
    const useCase = createJoinCircleUseCase(circles);

    const result = await useCase.execute(COMMAND);

    expect(result.terms.cadence.equals(Cadence.monthly)).toBe(true);
    // Y la junta arranca el día 1, como todas las mensuales (COPAYNI-108).
    expect(result.terms.startsOn.toString()).toBe('2026-11-01');
  });

  it('rechaza una cadencia que no está habilitada, con un error explícito', async () => {
    const circles = new InMemoryCircleRepository();
    const useCase = createJoinCircleUseCase(circles);

    await expect(useCase.execute({ ...COMMAND, cadence: 'weekly' })).rejects.toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: { cadence: 'not_enabled' },
      }),
    );
    // No se creó nada: la puerta está antes de abrir el círculo.
    await expect(
      circles.findOldestJoinable({
        payout: Money.of(3_000_000, 'PEN'),
        months: 10,
        cadence: Cadence.monthly,
        startsAfter: LocalDate.parse('2026-10-15'),
        userId: 'ana',
      }),
    ).resolves.toBeNull();
  });

  it('con monthly y weekly se crea una junta semanal, y no una quincenal', async () => {
    const circles = new InMemoryCircleRepository();
    const useCase = createJoinCircleUseCase(circles, {
      assignment: { cadences: [Cadence.monthly, Cadence.weekly] },
    });

    const weekly = await useCase.execute({ ...COMMAND, cadence: 'weekly' });
    expect(weekly.terms.cadence.equals(Cadence.weekly)).toBe(true);
    expect(weekly.terms.turns).toBe(10);

    await expect(
      useCase.execute({
        ...COMMAND,
        cadence: 'biweekly',
        idempotencyKey: 'key-ana-0000000002',
      }),
    ).rejects.toThrow(expect.objectContaining({ details: { cadence: 'not_enabled' } }));
  });

  it('una junta semanal en curso sigue operando aunque se deshabilite su cadencia', async () => {
    // El criterio que decide dónde va la puerta: la bandera gobierna la creación, no el ciclo.
    // Si el motor la consultara, deshabilitar una cadencia dejaría a sus juntas sin cobrar ni
    // pagar, con dinero de la gente dentro.
    const terms = CircleTerms.create({
      payout: Money.of(1_200_000, 'PEN'),
      turns: 4,
      cadence: Cadence.weekly,
      startsOn: LocalDate.parse('2026-11-04'),
    });
    const cycles = new InMemoryCircleCycleRepository();
    cycles.add({
      circleId: 'c-1',
      terms,
      state: 'collecting',
      currentPeriod: null,
      members: [1, 2, 3, 4].map((position) => ({
        userId: `u-${position}`,
        position,
        price: priceOf(TEST_PRICING.quote(terms, position)),
      })),
      installments: [],
    });
    const payments = new FakeCyclePayments();
    const clock = new TestClock(new Date('2026-11-04T17:00:00Z'));
    const advance = new AdvanceCircleCyclesUseCase(
      cycles,
      TEST_PRICING,
      {
        dueDay: 5,
        timeZone: 'America/Lima',
        delinquency: TEST_DELINQUENCY,
        fundFeeShareBps: TEST_FUND_SHARE_BPS,
        startApprovalDays: 7,
      },
      payments,
      payments,
      clock,
    );

    await expect(advance.execute()).resolves.toEqual({ advanced: 1, locked: 0, failed: 0 });

    expect(cycles.payouts.map(({ turn, userId }) => [turn, userId])).toEqual([[1, 'u-1']]);
    expect(cycles.get('c-1')).toMatchObject({ state: 'contributing', currentTurn: 2 });
  });
});
