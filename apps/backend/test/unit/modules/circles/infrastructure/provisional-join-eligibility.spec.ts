import { type AppConfigService } from '@src/config/configuration';
import { ProvisionalJoinEligibility } from '@src/modules/circles/infrastructure/eligibility/provisional-join-eligibility';
import { type GetSelectedPayoutMethodUseCase } from '@src/modules/payouts/application/use-cases/payout-method.use-cases';
import { type PayoutMethod } from '@src/modules/payouts/domain/payout-method';
import { Money } from '@src/shared/domain/value-objects/money';

const PREPAID: PayoutMethod = {
  type: 'prepaid_card',
  available: true,
  badges: ['no_charge'],
  limit: Money.of(10_000_000, 'PEN'),
};

function eligibility(env: Record<string, unknown>, method: PayoutMethod | null = PREPAID) {
  const values: Record<string, unknown> = {
    DEFAULT_CURRENCY: 'PEN',
    JOIN_IDENTITY_CHECK: 'assume_verified',
    JOIN_MONTHLY_PAYIN_LIMIT: 0,
    ...env,
  };
  const config = { get: (key: string) => values[key] } as unknown as AppConfigService;
  const payoutMethods = {
    execute: () => Promise.resolve(method),
  } as unknown as GetSelectedPayoutMethodUseCase;
  return new ProvisionalJoinEligibility(config, payoutMethods);
}

describe('ProvisionalJoinEligibility', () => {
  it('por defecto asume el National ID, no limita y usa el método elegido', async () => {
    await expect(eligibility({}).applicantFor('ana')).resolves.toEqual({
      identityVerified: true,
      monthlyPayInLimit: null,
      payoutMethod: { type: 'prepaid_card', limit: Money.of(10_000_000, 'PEN') },
    });
  });

  it('aplica la configuración: sin National ID y con límite mensual', async () => {
    const applicant = await eligibility(
      { JOIN_IDENTITY_CHECK: 'assume_unverified', JOIN_MONTHLY_PAYIN_LIMIT: 500_000 },
      null,
    ).applicantFor('ana');

    expect(applicant).toEqual({
      identityVerified: false,
      monthlyPayInLimit: Money.of(500_000, 'PEN'),
      payoutMethod: null,
    });
  });
});
