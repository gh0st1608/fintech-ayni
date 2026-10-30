import { type AppConfigService } from '@src/config/configuration';
import { ProvisionalJoinEligibility } from '@src/modules/circles/infrastructure/eligibility/provisional-join-eligibility';
import { KycPayInLimit } from '@src/modules/documents/application/kyc-pay-in-limit';
import { type KycStatusPort } from '@src/modules/documents/application/ports';
import { type GetSelectedPayoutMethodUseCase } from '@src/modules/payouts/application/use-cases/payout-method.use-cases';
import { type PayoutMethod } from '@src/modules/payouts/domain/payout-method';
import { Money } from '@src/shared/domain/value-objects/money';

const PREPAID: PayoutMethod = {
  type: 'prepaid_card',
  available: true,
  badges: ['no_charge'],
  limit: Money.of(10_000_000, 'PEN'),
};

function eligibility(
  env: Record<string, unknown>,
  method: PayoutMethod | null = PREPAID,
  kyc: KycStatusPort = {
    identityVerified: () => Promise.resolve(false),
    approvedMonthlyIncome: () => Promise.resolve(null),
  },
) {
  const values: Record<string, unknown> = {
    DEFAULT_CURRENCY: 'PEN',
    JOIN_IDENTITY_CHECK: 'assume_verified',
    JOIN_MONTHLY_PAYIN_LIMIT: 0,
    PAYIN_LIMIT_INCOME_SHARE_BPS: 3000,
    ...env,
  };
  const config = { get: (key: string) => values[key] } as unknown as AppConfigService;
  const payoutMethods = {
    execute: () => Promise.resolve(method),
  } as unknown as GetSelectedPayoutMethodUseCase;
  return new ProvisionalJoinEligibility(config, payoutMethods, kyc, new KycPayInLimit(config, kyc));
}

describe('ProvisionalJoinEligibility', () => {
  it('por defecto asume el National ID, no limita y usa el método elegido', async () => {
    await expect(eligibility({}).applicantFor('ana')).resolves.toEqual({
      identityVerified: true,
      monthlyPayInLimit: null,
      incomeDeclared: true,
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
      incomeDeclared: false,
      payoutMethod: null,
    });
  });

  it('usa el KYC aprobado: National ID, ingreso declarado y límite del 30 % (R5)', async () => {
    const kyc: KycStatusPort = {
      identityVerified: () => Promise.resolve(true),
      approvedMonthlyIncome: () => Promise.resolve(Money.of(350_000, 'PEN')),
    };
    const applicant = await eligibility(
      { JOIN_IDENTITY_CHECK: 'assume_unverified', JOIN_MONTHLY_PAYIN_LIMIT: 500_000 },
      null,
      kyc,
    ).applicantFor('ana');

    expect(applicant).toMatchObject({
      identityVerified: true,
      incomeDeclared: true,
      monthlyPayInLimit: Money.of(105_000, 'PEN'),
    });
  });
});
