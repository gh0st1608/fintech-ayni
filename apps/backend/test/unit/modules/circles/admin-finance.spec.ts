import { type AdminFinanceQueryPort } from '@src/modules/circles/application/ports/admin-finance-query.port';
import { type GuaranteeFundPort } from '@src/modules/circles/application/ports/guarantee-fund.port';
import {
  GetGuaranteeFundUseCase,
  ListInstallmentsUseCase,
} from '@src/modules/circles/application/use-cases/admin-finance.use-cases';
import { Money } from '@src/shared/domain/value-objects/money';

const emptyPage = { items: [], nextCursor: null };

function finance(): AdminFinanceQueryPort {
  return {
    installmentTotals: jest.fn(() => Promise.resolve([])),
    installments: jest.fn(() => Promise.resolve(emptyPage)),
    payouts: jest.fn(() => Promise.resolve(emptyPage)),
    fundMovements: jest.fn(() => Promise.resolve(emptyPage)),
  };
}

describe('finanzas del back-office', () => {
  it('rechaza un mes con otra forma que AAAA-MM', async () => {
    const useCase = new ListInstallmentsUseCase(finance());
    for (const period of ['2026-13', '2026-1', 'diciembre']) {
      await expect(useCase.execute({ period, limit: 10, cursor: null })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    }
    await expect(
      useCase.execute({ period: '2026-12', limit: 10, cursor: null }),
    ).resolves.toMatchObject({ totals: [] });
  });

  it('el mínimo del fondo son N cuotas base por círculo en curso', async () => {
    const fund: GuaranteeFundPort = {
      status: () =>
        Promise.resolve([
          {
            balance: Money.of(150_000, 'PEN'),
            activeCircles: 2,
            activeBaseInstallments: Money.of(100_000, 'PEN'),
          },
        ]),
      record: () => Promise.resolve(true),
    };
    const { balances } = await new GetGuaranteeFundUseCase(
      fund,
      { minInstallmentsPerCircle: 2 },
      finance(),
    ).execute({ limit: 10, cursor: null });
    expect(balances).toEqual([
      {
        balance: Money.of(150_000, 'PEN'),
        activeCircles: 2,
        minimum: Money.of(200_000, 'PEN'),
        belowMinimum: true,
      },
    ]);
  });
});
