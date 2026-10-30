import { type DueInstallment } from '@src/modules/circles/application/ports/payments-query.port';
import { GetPayoutEligibilityUseCase } from '@src/modules/circles/application/use-cases/get-payout-eligibility.use-case';
import { type JoinApplicant } from '@src/modules/circles/domain/services/join-eligibility';
import { PayoutEligibilityResponse } from '@src/modules/circles/presentation/http/dto/payout-eligibility.dto';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { ELIGIBLE, NO_DEBTS } from '@test/support/join-circle.fixture';

const due = (status: DueInstallment['status']): DueInstallment => ({
  circleId: 'c-1',
  period: Period.of(2026, 12),
  dueOn: LocalDate.parse('2026-12-05'),
  amount: Money.of(300_000, 'PEN'),
  status,
});

async function eligibilityOf(
  applicant: Partial<JoinApplicant> = {},
  dues: DueInstallment[] = [],
  debts = NO_DEBTS,
) {
  const useCase = new GetPayoutEligibilityUseCase(
    { applicantFor: () => Promise.resolve({ ...ELIGIBLE, ...applicant }) },
    {
      dueInstallmentsOf: () => Promise.resolve(dues),
      transactionsOf: jest.fn(),
      installment: jest.fn(),
    },
    debts,
  );
  return PayoutEligibilityResponse.from(await useCase.execute({ userId: 'u-1' }));
}

describe('GetPayoutEligibilityUseCase (COPAYNI-36)', () => {
  it('lista los requisitos en el orden del checklist; sin firma, contrato y pagaré no se cumplen', async () => {
    await expect(eligibilityOf()).resolves.toEqual({
      isEligible: false,
      requirements: [
        { requirement: 'national_id', status: 'met' },
        { requirement: 'insurance_note', status: 'unavailable' },
        { requirement: 'payout_method', status: 'met' },
        { requirement: 'contract', status: 'unavailable' },
        { requirement: 'due_payments', status: 'met' },
      ],
    });
  });

  it('marca pendientes el National ID, el método de cobro y los pagos atrasados', async () => {
    const result = await eligibilityOf({ identityVerified: false, payoutMethod: null }, [
      due('overdue'),
    ]);
    const status = Object.fromEntries(result.requirements.map((r) => [r.requirement, r.status]));
    expect(status).toMatchObject({
      national_id: 'pending',
      payout_method: 'pending',
      due_payments: 'pending',
    });
  });

  it('una cuota por vencer no atrasa los pagos; una deuda por impago sí', async () => {
    const statusOf = async (dues: DueInstallment[], debts = NO_DEBTS) =>
      (await eligibilityOf({}, dues, debts)).requirements.find(
        (r) => r.requirement === 'due_payments',
      )?.status;
    await expect(statusOf([due('pending')])).resolves.toBe('met');
    await expect(
      statusOf([], {
        ...NO_DEBTS,
        openDebtsOf: () =>
          Promise.resolve([
            { circleId: 'c-1', overdue: Money.of(1, 'PEN'), lateFee: Money.of(0, 'PEN') },
          ]),
      }),
    ).resolves.toBe('pending');
  });
});
