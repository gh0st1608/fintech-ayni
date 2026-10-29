import { Logger } from '@nestjs/common';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { GetAvailableSlotsUseCase } from '@src/modules/circles/application/use-cases/get-available-slots.use-case';
import { type CollectionOutcome } from '@src/modules/circles/domain/entities/circle-cycle';
import { priceOf, SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import {
  assertSlotAllowed,
  slotRestriction,
  type TrustProfile,
} from '@src/modules/circles/domain/services/trust-policy';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LedgerTransaction } from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import {
  fromStoredPrice,
  toStoredPrice,
} from '@src/modules/circles/infrastructure/persistence/typeorm/slot-price.mapper';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import {
  createJoinCircleUseCase,
  ELIGIBLE,
  historyWith,
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_JOIN_CONFIG,
  TEST_TRUST,
} from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const at = (date: string) => new Date(`${date}T17:00:00Z`);

/** Sin fees, descuentos ni Admin Fees, con la retención propuesta de 2 cuotas base (R18). */
const RETAINING = new SlotPricing(
  SlotPricingRules.create({
    fastestShareBps: 0,
    highestShareBps: 0,
    maxFeeBps: 0,
    maxDiscountBps: 0,
    adminFeeBps: 0,
    adminFeeMode: 'added_to_installments',
    retentionInstallments: 2,
  }),
);
/** El ejemplo de pending-scope §3.1: 30.000 en 10 meses desde noviembre de 2026. */
const TERMS = CircleTerms.create({
  payout: pen(30_000),
  months: 10,
  startsOn: Period.of(2026, 11),
});

const profile = (overrides: Partial<TrustProfile> = {}): TrustProfile => ({
  completedCircles: 0,
  identityVerified: true,
  incomeDeclared: true,
  ...overrides,
});

describe('Regla de confianza por tipo de turno (COPAYNI-60)', () => {
  it.each([
    ['fastest_payout', profile(), 'trust_required'],
    ['fastest_payout', profile({ completedCircles: 1 }), null],
    ['lowest_fees', profile(), null],
    ['lowest_fees', profile({ incomeDeclared: false }), 'income_required'],
    ['highest_return', profile({ incomeDeclared: false }), null],
    ['highest_return', profile({ identityVerified: false }), 'identity_required'],
  ] as const)('%s con %o → %s', (type, trust, expected) => {
    expect(slotRestriction(type, trust, TEST_TRUST)).toBe(expected);
  });

  it('el mínimo de círculos es configurable y el rechazo dice el motivo', () => {
    expect(slotRestriction('fastest_payout', profile(), { fastestMinCompletedCircles: 0 })).toBe(
      null,
    );
    expect(() => assertSlotAllowed('fastest_payout', profile(), TEST_TRUST)).toThrow(
      expect.objectContaining({ code: 'SLOT_NOT_ALLOWED', details: { reason: 'trust_required' } }),
    );
  });

  it('un usuario nuevo no puede unirse a un turno Fastest Payout; con un círculo completado, sí', async () => {
    const command = {
      userId: 'ana',
      circleId: null,
      payoutAmount: 3_000_000,
      months: 10,
      position: 1,
      idempotencyKey: 'key-ana-0000000001',
    };
    await expect(
      createJoinCircleUseCase(new InMemoryCircleRepository(), { completedCircles: 0 }).execute(
        command,
      ),
    ).rejects.toMatchObject({ code: 'SLOT_NOT_ALLOWED' });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await expect(
      createJoinCircleUseCase(new InMemoryCircleRepository(), { completedCircles: 1 }).execute(
        command,
      ),
    ).resolves.toMatchObject({ created: true });
    jest.restoreAllMocks();
  });

  it('slots marca los turnos que el usuario no puede tomar, con su motivo', async () => {
    const slots = new GetAvailableSlotsUseCase(
      { getForUser: () => Promise.resolve(TEST_JOIN_CONFIG) },
      new InMemoryCircleRepository(),
      RETAINING,
      { strategy: 'fill_oldest', startOffsetMonths: 1, timeZone: 'America/Lima' },
      { dueDay: 5 },
      { applicantFor: () => Promise.resolve({ ...ELIGIBLE, incomeDeclared: false }) },
      historyWith(0),
      TEST_TRUST,
      new TestClock(at('2026-10-15')),
    );
    const result = await slots.execute({ userId: 'ana' }, 3_000_000, 10);
    // Sin fees, todos los slots son Lowest Fees: sin ingreso declarado, ninguno se permite.
    expect(new Set(result.slots.map(({ restriction }) => restriction))).toEqual(
      new Set(['income_required']),
    );
  });
});

describe('Retención del payout (COPAYNI-60)', () => {
  it('turno 3 de 30.000 en 10 meses: recibe 24.000 y la retención paga los meses 9 y 10', () => {
    const quote = RETAINING.quote(TERMS, 3);
    expect(quote.retention).toEqual(pen(6_000));
    expect(quote.netPayout).toEqual(pen(24_000));
    expect(quote.totalPaid).toEqual(pen(30_000));
    // Solo la primera mitad: el turno 5 retiene, el 6 no.
    expect(RETAINING.quote(TERMS, 5).retention).toEqual(pen(6_000));
    expect(RETAINING.quote(TERMS, 6).retention).toEqual(pen(0));
    // Sin cuotas suficientes después del cobro, retiene las que haya.
    const short = CircleTerms.create({ payout: pen(6_000), months: 2, startsOn: TERMS.startsOn });
    expect(RETAINING.quote(short, 1).retention).toEqual(pen(3_000));
  });

  it('se congela con el precio y un precio anterior a COPAYNI-60 no tiene retención', () => {
    const price = priceOf(RETAINING.quote(TERMS, 3));
    expect(fromStoredPrice(toStoredPrice(price)).retention).toEqual(pen(6_000));
    const legacy = priceOf(RETAINING.quote(TERMS, 8));
    expect(legacy.retention).toBeUndefined();
    expect(RETAINING.quoteOf(TERMS, 8, legacy).retention).toEqual(pen(0));
    expect(() =>
      SlotPricingRules.create({ ...RETAINING_RULES, retentionInstallments: 13 }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_SLOT_PRICING_RULES' }));
  });

  function cycle(failing: (userId: string, period: string) => boolean = () => false) {
    const cycles = new InMemoryCircleCycleRepository();
    cycles.add({
      circleId: 'c-1',
      terms: TERMS,
      state: 'collecting',
      currentPeriod: null,
      members: Array.from({ length: 10 }, (_, index) => ({
        userId: `u-${index + 1}`,
        position: index + 1,
        price: priceOf(RETAINING.quote(TERMS, index + 1)),
      })),
      installments: [],
    });
    const collected: string[] = [];
    const disbursed: { userId: string; amount: Money }[] = [];
    const payments = {
      collect: (installment: { userId: string; period: Period }): Promise<CollectionOutcome> => {
        collected.push(`${installment.userId}@${installment.period.toString()}`);
        return Promise.resolve(
          failing(installment.userId, installment.period.toString()) ? 'failed' : 'paid',
        );
      },
      disburse: (disbursement: { userId: string; amount: Money }) => {
        disbursed.push(disbursement);
        return Promise.resolve();
      },
      refund: () => Promise.resolve(),
    };
    const clock = new TestClock(at('2026-10-15'));
    const useCase = new AdvanceCircleCyclesUseCase(
      cycles,
      RETAINING,
      {
        dueDay: 5,
        timeZone: 'America/Lima',
        delinquency: TEST_DELINQUENCY,
        fundFeeShareBps: TEST_FUND_SHARE_BPS,
      },
      payments,
      payments,
      clock,
    );
    const runAll = async () => {
      for (let month = 0; month < 10; month += 1) {
        const period = TERMS.startsOn.addMonths(month).toString();
        for (const day of ['05', '09']) {
          clock.set(at(`${period}-${day}`));
          await useCase.execute();
        }
      }
    };
    return { cycles, collected, disbursed, runAll };
  }

  beforeEach(() => {
    for (const level of ['log', 'warn'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('en el ciclo, la retención se guarda al cobrar y paga sus últimas cuotas sin cobrarlas', async () => {
    const { cycles, collected, disbursed, runAll } = cycle();
    await runAll();

    expect(cycles.get('c-1')?.state).toBe('finished');
    expect(disbursed.find(({ userId }) => userId === 'u-3')?.amount).toEqual(pen(24_000));
    expect(disbursed.find(({ userId }) => userId === 'u-8')?.amount).toEqual(pen(30_000));
    // Sus cuotas de julio y agosto de 2027 (meses 9 y 10) no se cobran: las paga la retención.
    expect(collected.filter((entry) => entry.startsWith('u-3@'))).toHaveLength(8);
    const retained = [...cycles.installments.values()].filter(
      ({ status }) => status === 'retained',
    );
    expect(
      retained.filter(({ userId }) => userId === 'u-3').map(({ period }) => period.toString()),
    ).toEqual(['2027-07', '2027-08']);
    expect(cycles.ledger.get('retention_held:c-1:2027-01')?.netFor('retention_held')).toEqual(
      pen(6_000),
    );
    expect(cycles.balance('retention_held')).toEqual(pen(0));
    expect(cycles.balance('circle_pot')).toEqual(pen(0));
    expect(cycles.balance('guarantee_fund')).toEqual(pen(0));
  });

  it('si deja de pagar después de cobrar, la retención va a su deuda y el fondo cubre el resto', async () => {
    // El turno 3 cobra en enero de 2027 y deja de pagar en marzo (mes 5).
    const { cycles, disbursed, runAll } = cycle(
      (userId, period) => userId === 'u-3' && period >= '2027-03',
    );
    // Capital semilla del escenario conservador (30.000 PEN).
    cycles.record(
      LedgerTransaction.transfer({
        key: 'seed_capital:op-1',
        kind: 'seed_capital',
        from: { account: 'external' },
        to: { account: 'guarantee_fund' },
        amount: pen(30_000),
        reason: 'Capital semilla de prueba',
      })!,
    );
    await runAll();

    const [expulsion] = cycles.expulsions;
    // Debe sus 6 cuotas restantes (18.000) menos la retención (6.000).
    expect(expulsion).toMatchObject({
      userId: 'u-3',
      overdue: pen(12_000),
      retentionApplied: pen(6_000),
      refund: null,
    });
    expect(cycles.ledger.get('retention_to_fund:c-1:u-3')?.netFor('guarantee_fund')).toEqual(
      pen(6_000),
    );
    // El fondo cubrió sus 6 cuotas (18.000) y recibió la retención: le falta lo que debe.
    expect(cycles.balance('guarantee_fund')).toEqual(pen(30_000 - 12_000));
    expect([...cycles.ledger.values()].some(({ kind }) => kind === 'fund_debt_to_member')).toBe(
      false,
    );
    expect(disbursed).toHaveLength(10);
    expect(cycles.balance('retention_held')).toEqual(pen(0));
    expect(cycles.balance('circle_pot')).toEqual(pen(0));
  });
});

const RETAINING_RULES = {
  fastestShareBps: 0,
  highestShareBps: 0,
  maxFeeBps: 0,
  maxDiscountBps: 0,
  adminFeeBps: 0,
  adminFeeMode: 'added_to_installments' as const,
};
