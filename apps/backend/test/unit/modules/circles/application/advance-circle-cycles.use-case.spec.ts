import { Logger } from '@nestjs/common';

import { type StoredCycle } from '@src/modules/circles/application/ports/circle-cycle-repository.port';
import {
  type ContributionsPort,
  type DisbursementsPort,
} from '@src/modules/circles/application/ports/cycle-payments.port';
import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import {
  type CollectionOutcome,
  type Installment,
} from '@src/modules/circles/domain/entities/circle-cycle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import {
  FakeCyclePayments,
  UnconfiguredCyclePayments,
} from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import { TEST_DELINQUENCY, TEST_PRICING } from '@test/support/join-circle.fixture';

/** Payout de 6.000 en 6 meses desde noviembre de 2026, con los 6 turnos tomados. */
const TERMS = CircleTerms.create({
  payout: Money.of(600_000, 'PEN'),
  months: 6,
  startsOn: Period.of(2026, 11),
});
const MEMBERS = Array.from({ length: 6 }, (_, index) => ({
  userId: `u-${index + 1}`,
  position: index + 1,
}));

/** Pagos de prueba: cobra a todos salvo a los usuarios de `failing`, y registra todo. */
class ScriptedPayments implements ContributionsPort, DisbursementsPort {
  readonly failing = new Set<string>();
  readonly collected: string[] = [];
  readonly disbursed: string[] = [];

  collect(installment: Installment): Promise<CollectionOutcome> {
    this.collected.push(installment.id);
    return Promise.resolve(this.failing.has(installment.userId) ? 'failed' : 'paid');
  }

  disburse(disbursement: { userId: string; period: Period }): Promise<void> {
    this.disbursed.push(`${disbursement.userId}@${disbursement.period.toString()}`);
    return Promise.resolve();
  }
}

/** Lima es UTC-5: las 17:00 UTC son mediodía del día indicado. */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

function setup(members: StoredCycle['members'] = MEMBERS, extra: Partial<StoredCycle> = {}) {
  const cycles = new InMemoryCircleCycleRepository();
  cycles.add({
    circleId: 'c-1',
    terms: TERMS,
    state: 'collecting',
    currentPeriod: null,
    members,
    installments: [],
    ...extra,
  });
  const payments = new ScriptedPayments();
  const clock = new TestClock(at('2026-10-15'));
  const useCase = new AdvanceCircleCyclesUseCase(
    cycles,
    TEST_PRICING,
    { dueDay: 5, timeZone: 'America/Lima', delinquency: TEST_DELINQUENCY },
    payments,
    payments,
    clock,
  );
  const runOn = (date: string) => {
    clock.set(at(date));
    return useCase.execute();
  };
  return { cycles, payments, runOn };
}

describe('AdvanceCircleCyclesUseCase', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('un círculo de 6 meses llega a finished solo con la tarea diaria y paga cada turno', async () => {
    const { cycles, payments, runOn } = setup();
    await expect(runOn('2026-10-31')).resolves.toEqual({ advanced: 0, locked: 0, failed: 0 });

    await runOn('2026-11-01');
    expect(cycles.get('c-1')).toMatchObject({ state: 'contributing' });
    expect(payments.collected).toEqual([]);

    for (const date of ['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05']) {
      await runOn(date);
    }
    expect(cycles.get('c-1')?.state).toBe('contributing');
    await runOn('2027-04-05');

    expect(cycles.get('c-1')).toMatchObject({ state: 'finished', currentPeriod: null });
    expect(payments.disbursed).toEqual([
      'u-1@2026-11',
      'u-2@2026-12',
      'u-3@2027-01',
      'u-4@2027-02',
      'u-5@2027-03',
      'u-6@2027-04',
    ]);
    expect(cycles.payouts[1]?.amount).toEqual(TEST_PRICING.quote(TERMS, 2).netPayout);
    expect(cycles.installments.size).toBe(36);
    expect([...cycles.installments.values()].every(({ status }) => status === 'paid')).toBe(true);
    expect(log).toHaveBeenCalledWith({ event: 'circles.cycle.finished', circleId: 'c-1' });
  });

  it('ejecutarla dos veces el mismo día no cobra ni paga dos veces', async () => {
    const { cycles, payments, runOn } = setup();
    await runOn('2026-11-05');
    await runOn('2026-11-05');

    expect(payments.collected).toHaveLength(6);
    expect(payments.disbursed).toEqual(['u-1@2026-11']);
    expect(cycles.payouts).toHaveLength(1);
  });

  it('si no corrió varios meses, se pone al día', async () => {
    const { cycles, payments, runOn } = setup();
    await runOn('2027-01-20');

    expect(payments.disbursed).toEqual(['u-1@2026-11', 'u-2@2026-12', 'u-3@2027-01']);
    expect(cycles.get('c-1')?.currentPeriod).toEqual(Period.of(2027, 2));
  });

  it('una cuota impaga deja el mes abierto, sin payout, y se reintenta cada día', async () => {
    const { cycles, payments, runOn } = setup();
    payments.failing.add('u-4');
    await runOn('2026-11-05');

    expect(payments.disbursed).toEqual([]);
    const overdue = [...cycles.installments.values()].filter(({ status }) => status === 'overdue');
    expect(overdue.map(({ userId }) => userId)).toEqual(['u-4']);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'circles.cycle.installment_overdue', userId: 'u-4' }),
    );

    await runOn('2026-11-06');
    expect(payments.collected).toHaveLength(7);
    payments.failing.clear();
    await runOn('2026-11-07');
    expect(payments.disbursed).toEqual(['u-1@2026-11']);
  });

  it('expulsa al terminar la gracia aunque pague tarde, y cierra el mes sin su cuota', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { cycles, payments, runOn } = setup();
    payments.failing.add('u-4');
    for (const date of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
      await runOn(date);
    }
    expect(cycles.expulsions).toEqual([]);
    expect(payments.disbursed).toEqual([]);

    // Paga el día 5 de gracia: ya es tarde y no se le vuelve a cobrar.
    payments.failing.clear();
    const attempts = payments.collected.length;
    await runOn('2026-11-09');
    expect(payments.collected).toHaveLength(attempts);

    const installment = TEST_PRICING.quote(TERMS, 4).installments[0]!;
    expect(cycles.expulsions).toEqual([
      expect.objectContaining({
        circleId: 'c-1',
        userId: 'u-4',
        overdue: installment,
        lateFee: installment.percentage(300),
        refund: Money.zero('PEN'),
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'circles.cycle.member_expelled', userId: 'u-4' }),
    );
    expect(payments.disbursed).toEqual(['u-1@2026-11']);
    expect(cycles.get('c-1')?.members.map(({ userId }) => userId)).not.toContain('u-4');
    expect(
      [...cycles.installments.values()].find(
        ({ userId, period }) => userId === 'u-4' && period.equals(Period.of(2026, 11)),
      )?.status,
    ).toBe('defaulted');

    // Ya no se le abren cuotas y su mes de cobro (febrero) no tiene payout.
    for (const date of ['2026-12-05', '2027-01-05', '2027-02-05']) await runOn(date);
    expect([...cycles.installments.values()].filter(({ userId }) => userId === 'u-4')).toHaveLength(
      1,
    );
    expect(payments.disbursed).toEqual(['u-1@2026-11', 'u-2@2026-12', 'u-3@2027-01']);
    expect(warn).toHaveBeenCalledWith({
      event: 'circles.cycle.payout_unassigned',
      circleId: 'c-1',
      period: '2027-02',
    });
  });

  it('usa el precio congelado de cada miembro', async () => {
    const price = priceOf(TEST_PRICING.quote(TERMS, 1));
    const frozen = { ...price, installments: price.installments.map(() => Money.of(1, 'PEN')) };
    const { cycles, runOn } = setup([{ userId: 'u-1', position: 1, price: frozen }]);
    await runOn('2026-11-05');

    expect([...cycles.installments.values()][0]?.amount).toEqual(Money.of(1, 'PEN'));
  });

  it('un turno libre no recibe payout y queda registrado', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { payments, runOn } = setup(MEMBERS.slice(1));
    await runOn('2026-11-05');

    expect(payments.disbursed).toEqual([]);
    expect(warn).toHaveBeenCalledWith({
      event: 'circles.cycle.payout_unassigned',
      circleId: 'c-1',
      period: '2026-11',
    });
  });

  it('salta los círculos bloqueados, pausados o que todavía no empiezan', async () => {
    const { cycles, runOn } = setup();
    cycles.add({
      circleId: 'pausado',
      terms: TERMS,
      state: 'paused',
      currentPeriod: Period.of(2026, 11),
      members: MEMBERS,
      installments: [],
    });
    cycles.lock('c-1');

    await expect(runOn('2026-11-05')).resolves.toEqual({ advanced: 0, locked: 1, failed: 0 });
    expect(cycles.get('c-1')?.state).toBe('collecting');
  });

  it('un círculo que falla no guarda nada ni detiene a los demás', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const cycles = new InMemoryCircleCycleRepository();
    for (const circleId of ['roto', 'sano']) {
      cycles.add({
        circleId,
        terms: TERMS,
        state: 'collecting',
        currentPeriod: null,
        members: MEMBERS,
        installments: [],
      });
    }
    const fake = new FakeCyclePayments();
    const broken = new UnconfiguredCyclePayments();
    const useCase = new AdvanceCircleCyclesUseCase(
      cycles,
      TEST_PRICING,
      { dueDay: 5, timeZone: 'America/Lima', delinquency: TEST_DELINQUENCY },
      {
        collect: (installment) => (installment.circleId === 'roto' ? broken : fake).collect(),
      },
      fake,
      new TestClock(at('2026-11-05')),
    );

    await expect(useCase.execute()).resolves.toEqual({ advanced: 1, locked: 0, failed: 1 });
    expect(cycles.get('roto')?.state).toBe('collecting');
    expect(cycles.get('sano')?.state).toBe('contributing');
    expect(error).toHaveBeenCalledWith({
      event: 'circles.cycle.failed',
      circleId: 'roto',
      reason: expect.stringContaining('CIRCLE_PAYMENTS_ADAPTER'),
    });
    await expect(broken.disburse()).rejects.toThrow('CIRCLE_PAYMENTS_ADAPTER');
  });
});
