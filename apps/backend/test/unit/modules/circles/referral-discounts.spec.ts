import { Logger } from '@nestjs/common';

import { type GuaranteeFundPort } from '@src/modules/circles/application/ports/guarantee-fund.port';
import { ReferralDiscounts } from '@src/modules/circles/application/use-cases/referral-discounts';
import { GatewayCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { type CollectInstallmentUseCase } from '@src/modules/payments/application/use-cases/collect-installment.use-case';
import { type ReferralRepositoryPort } from '@src/modules/referrals/application/ports/referral-repository.port';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const SETTINGS = { reward: pen(150), maxRewardedInvites: 10, linkBaseUrl: 'ayni://invite' };

function setup(balance: number, redeemable = balance) {
  const referrals = {
    totalsOf: () => Promise.resolve({ earned: balance * 100, redeemed: 0 }),
    redeem: jest.fn().mockResolvedValue(redeemable * 100),
  } as unknown as ReferralRepositoryPort;
  const ledger: GuaranteeFundPort = {
    status: jest.fn(),
    record: jest.fn().mockResolvedValue(true),
  };
  return { referrals, ledger, discounts: new ReferralDiscounts(referrals, SETTINGS, ledger) };
}
const INSTALLMENT = {
  id: 'inst-1',
  circleId: 'c-1',
  userId: 'u-1',
  position: 1,
  period: Period.of(2026, 12),
  dueOn: LocalDate.parse('2026-12-05'),
  amount: pen(1_000),
  status: 'pending' as const,
};

describe('Descuento de referidos en la cuota (COPAYNI-53)', () => {
  beforeEach(() => {
    for (const level of ['log', 'warn'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('aplica el saldo sin superar la cuota', async () => {
    await expect(setup(150).discounts.quote('u-1', pen(1_000))).resolves.toEqual(pen(150));
    await expect(setup(5_000).discounts.quote('u-1', pen(1_000))).resolves.toEqual(pen(1_000));
    await expect(setup(0).discounts.quote('u-1', pen(1_000))).resolves.toEqual(pen(0));
  });

  it('canjea una vez por cuota y registra que la cooperativa paga el descuento', async () => {
    const { referrals, ledger, discounts } = setup(150);
    await discounts.apply(INSTALLMENT, pen(150));
    expect(referrals.redeem).toHaveBeenCalledWith('u-1', 'installment:inst-1', pen(150), 10);
    const [transaction] = (ledger.record as jest.Mock).mock.calls[0] as [
      { key: string; netFor: (account: string) => Money },
    ];
    expect(transaction.key).toBe('referral_discount:inst-1');
    expect(transaction.netFor('operator')).toEqual(pen(-150));
    expect(transaction.netFor('external')).toEqual(pen(150));

    // Ya canjeado (o sin saldo): no registra nada más.
    const none = setup(150, 0);
    await none.discounts.apply(INSTALLMENT, pen(150));
    await none.discounts.apply(INSTALLMENT, pen(0));
    expect(none.ledger.record).not.toHaveBeenCalled();
  });

  it('si otra cuota gastó parte del saldo, avisa y registra el descuento dado', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const { ledger, discounts } = setup(150, 100);
    await discounts.apply(INSTALLMENT, pen(150));
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'referrals.discount_exceeded_balance', redeemed: 10_000 }),
    );
    expect(ledger.record).toHaveBeenCalled();
  });

  it('el débito automático cobra la cuota menos el descuento, o nada si lo cubre', async () => {
    const collect = { execute: jest.fn().mockResolvedValue(true) };
    const partial = setup(150);
    const payments = new GatewayCyclePayments(
      collect as unknown as CollectInstallmentUseCase,
      partial.discounts,
    );
    await expect(payments.collect(INSTALLMENT)).resolves.toBe('paid');
    expect(collect.execute).toHaveBeenCalledWith(expect.objectContaining({ amount: pen(850) }));
    expect(partial.ledger.record).toHaveBeenCalled();

    const covered = setup(5_000);
    collect.execute.mockClear();
    const free = new GatewayCyclePayments(
      collect as unknown as CollectInstallmentUseCase,
      covered.discounts,
    );
    await expect(free.collect(INSTALLMENT)).resolves.toBe('paid');
    expect(collect.execute).not.toHaveBeenCalled();

    collect.execute.mockResolvedValue(false);
    const failed = setup(150);
    const rejected = new GatewayCyclePayments(
      collect as unknown as CollectInstallmentUseCase,
      failed.discounts,
    );
    await expect(rejected.collect(INSTALLMENT)).resolves.toBe('failed');
    expect(failed.referrals.redeem).not.toHaveBeenCalled();
  });
});
