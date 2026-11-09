import { Logger } from '@nestjs/common';

import {
  type KycReviewDetail,
  type KycReviewRepositoryPort,
} from '@src/modules/documents/application/kyc-review.ports';
import {
  DecideKycReviewUseCase,
  GetKycPageUrlUseCase,
} from '@src/modules/documents/application/kyc-review.use-cases';
import { type DocumentStoragePort } from '@src/modules/documents/application/ports';
import { Money } from '@src/shared/domain/value-objects/money';

const INCOME: KycReviewDetail = {
  id: '0b0c5c4e-1d8f-4b8a-9f3e-111111111111',
  type: 'proof_of_income',
  kind: 'hr_letter',
  status: 'in_review',
  pages: 1,
  monthlyIncome: Money.of(350000, 'PEN'),
  submittedAt: new Date('2026-11-09T12:00:00Z'),
  superseded: false,
  subject: { userId: 'u1', email: null, phone: '+51987654321', firstName: null, lastName: null },
  reason: null,
  reviewedAt: null,
  reviewedBy: null,
  pageFiles: [{ page: 1, purpose: 'proof_of_income', sizeBytes: 10, storageKey: 'kyc/u1/x' }],
};

function repository(overrides: Partial<KycReviewRepositoryPort> = {}): KycReviewRepositoryPort {
  return {
    list: jest.fn(),
    find: jest.fn(() => Promise.resolve(INCOME)),
    decide: jest.fn(() => Promise.resolve({ decided: true as const })),
    ...overrides,
  };
}

beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('DecideKycReviewUseCase', () => {
  const approve = (reviews: KycReviewRepositoryPort, monthlyIncome?: number) =>
    new DecideKycReviewUseCase(reviews).execute({
      id: INCOME.id,
      input: { action: 'approve', ...(monthlyIncome !== undefined && { monthlyIncome }) },
      staffId: 'staff-1',
    });

  it('rechaza un ingreso corregido que no es un entero positivo', async () => {
    for (const value of [0, -5, 1.5]) {
      await expect(approve(repository(), value)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    }
  });

  it('aprueba con el ingreso corregido en la moneda del comprobante', async () => {
    const reviews = repository();
    await approve(reviews, 320000);
    expect(reviews.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: { status: 'approved', monthlyIncome: Money.of(320000, 'PEN') },
        reasonText: null,
        reviewedBy: 'staff-1',
      }),
    );
  });

  it('si el documento desaparece entre la lectura y la decisión, responde 404', async () => {
    await expect(
      approve(repository({ decide: jest.fn(() => Promise.resolve(null)) })),
    ).rejects.toMatchObject({ code: 'KYC_REVIEW_NOT_FOUND' });

    const vanishing = repository({
      find: jest.fn().mockResolvedValueOnce(INCOME).mockResolvedValueOnce(null),
    });
    await expect(approve(vanishing)).rejects.toMatchObject({ code: 'KYC_REVIEW_NOT_FOUND' });
  });

  it('si otra persona lo resolvió antes, responde 409 con el estado que dejó', async () => {
    await expect(
      approve(
        repository({
          decide: jest.fn(() =>
            Promise.resolve({ decided: false as const, status: 'rejected' as const }),
          ),
        }),
      ),
    ).rejects.toMatchObject({ code: 'KYC_ALREADY_REVIEWED', details: { status: 'rejected' } });
  });
});

describe('GetKycPageUrlUseCase', () => {
  it('firma la página con 60 s de vigencia', async () => {
    const storage = {
      presignDownload: jest.fn(() =>
        Promise.resolve({ url: 'https://s3/kyc', expiresAt: new Date() }),
      ),
    } as unknown as DocumentStoragePort;
    await new GetKycPageUrlUseCase(repository(), storage).execute(INCOME.id, 1);
    expect(storage.presignDownload).toHaveBeenCalledWith({
      key: 'kyc/u1/x',
      expiresInSeconds: 60,
    });
  });
});
