import { Logger } from '@nestjs/common';

import { type PaymentSettings } from '@src/modules/circles/application/ports/payment-settings.port';
import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import {
  GetPaymentSettingsUseCase,
  UpdatePaymentSettingsUseCase,
} from '@src/modules/circles/application/use-cases/payment-settings.use-cases';
import { type CollectionOutcome } from '@src/modules/circles/domain/entities/circle-cycle';
import { priceOf, SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING_RULES,
} from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const at = (date: string) => new Date(`${date}T17:00:00Z`);
/** 30.000 en 10 meses desde noviembre de 2026, como el ejemplo de §3.1. */
const TERMS = CircleTerms.create({
  payout: pen(30_000),
  months: 10,
  startsOn: Period.of(2026, 11),
});
const pricing = (retentionInstallments = 0, adminFeeBps = 0) =>
  new SlotPricing(
    SlotPricingRules.create({
      ...TEST_PRICING_RULES.props,
      fastestShareBps: 0,
      highestShareBps: 0,
      adminFeeBps,
      retentionInstallments,
    }),
  );

/** Corre el círculo completo; `u-3` (cobra en enero de 2027) pidió descontar su cuota. */
async function run(rules: SlotPricing) {
  const cycles = new InMemoryCircleCycleRepository();
  cycles.add({
    circleId: 'c-1',
    terms: TERMS,
    state: 'collecting',
    currentPeriod: null,
    members: Array.from({ length: 10 }, (_, index) => ({
      userId: `u-${index + 1}`,
      position: index + 1,
      price: priceOf(rules.quote(TERMS, index + 1)),
      deductPayIn: index + 1 === 3,
    })),
    installments: [],
  });
  const collected: string[] = [];
  const disbursed: { userId: string; amount: Money }[] = [];
  const payments = {
    collect: (installment: { userId: string; period: Period }): Promise<CollectionOutcome> => {
      collected.push(`${installment.userId}@${installment.period.toString()}`);
      return Promise.resolve('paid');
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
    rules,
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
  for (let month = 0; month < 10; month += 1) {
    clock.set(at(`${TERMS.startsOn.addMonths(month).toString()}-05`));
    await useCase.execute();
  }
  return { cycles, collected, disbursed };
}

describe('Deducción del pay-in desde el payout (COPAYNI-38)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('la cuota de su mes de cobro no se cobra: se descuenta del payout', async () => {
    const { cycles, collected, disbursed } = await run(pricing());

    expect(cycles.get('c-1')?.state).toBe('finished');
    expect(collected).not.toContain('u-3@2027-01');
    expect(collected.filter((entry) => entry.startsWith('u-3@'))).toHaveLength(9);
    expect(disbursed.find(({ userId }) => userId === 'u-3')?.amount).toEqual(pen(27_000));
    expect(disbursed.find(({ userId }) => userId === 'u-4')?.amount).toEqual(pen(30_000));
    const deducted = [...cycles.installments.values()].filter(
      ({ status }) => status === 'deducted',
    );
    expect(deducted.map(({ userId, period }) => `${userId}@${period.toString()}`)).toEqual([
      'u-3@2027-01',
    ]);
    // Sin fees, la cuota es solo la cuota base: el pozo cierra en cero y el fondo no cubre nada.
    expect(cycles.balance('circle_pot')).toEqual(pen(0));
    expect([...cycles.ledger.values()].some(({ kind }) => kind === 'coverage')).toBe(false);
  });

  it('con Admin Fees y retención: descuenta la cuota completa y las fees van a operator', async () => {
    const { cycles, disbursed } = await run(pricing(2, 1_200));
    // Turno 3: payout de 30.000 menos 6.000 de retención; su cuota de enero incluye
    // 3.000 de cuota base y 1.200 de Admin Fees (3.600 repartidas en 3 meses).
    expect(disbursed.find(({ userId }) => userId === 'u-3')?.amount).toEqual(
      pen(30_000 - 6_000 - 4_200),
    );
    expect(cycles.ledger.get('payin_deducted:c-1:2027-01')?.netFor('operator')).toEqual(pen(1_200));
    expect(cycles.balance('circle_pot')).toEqual(pen(0));
    expect(cycles.balance('retention_held')).toEqual(pen(0));
  });
});

describe('Payment Settings', () => {
  class FakeSettings {
    readonly saved = new Map<string, PaymentSettings>();
    get(userId: string) {
      return Promise.resolve(this.saved.get(userId) ?? { deductPayInFromPayout: false });
    }
    save(userId: string, settings: PaymentSettings) {
      this.saved.set(userId, settings);
      return Promise.resolve();
    }
  }

  it('por defecto no descuenta; el cambio se guarda', async () => {
    const settings = new FakeSettings();
    const principal = { userId: 'u-1' };
    await expect(new GetPaymentSettingsUseCase(settings).execute(principal)).resolves.toEqual({
      deductPayInFromPayout: false,
    });
    await expect(
      new UpdatePaymentSettingsUseCase(settings).execute(principal, {
        deductPayInFromPayout: true,
      }),
    ).resolves.toEqual({ deductPayInFromPayout: true });
    expect(settings.saved.get('u-1')).toEqual({ deductPayInFromPayout: true });
  });
});
