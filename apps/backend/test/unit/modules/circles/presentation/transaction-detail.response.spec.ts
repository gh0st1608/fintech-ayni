import { type TransactionDetail } from '@src/modules/circles/application/ports/payments-query.port';
import { GetTransactionUseCase } from '@src/modules/circles/application/use-cases/get-transaction.use-case';
import { TransactionDetailResponse } from '@src/modules/circles/presentation/http/dto/transactions.dto';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const PAYOUT: TransactionDetail = {
  id: 't-1',
  type: 'payout',
  kind: 'payout',
  circleId: 'c-1',
  period: Period.of(2027, 2),
  amount: pen(24_000),
  occurredAt: new Date('2027-02-02T14:15:00Z'),
  circlePayout: pen(30_000),
  position: 4,
};

describe('Detalle de un movimiento (COPAYNI-78)', () => {
  it('en un payout informa lo descontado del pozo (retención y cuotas descontadas)', () => {
    expect(TransactionDetailResponse.fromDetail(PAYOUT)).toEqual({
      id: 't-1',
      type: 'payout',
      kind: 'payout',
      circleId: 'c-1',
      period: '2027-02',
      amount: { amount: 2_400_000, currency: 'PEN' },
      occurredAt: '2027-02-02T14:15:00.000Z',
      circlePayout: { amount: 3_000_000, currency: 'PEN' },
      position: 4,
      deductions: { amount: 600_000, currency: 'PEN' },
    });
  });

  it('en un pago de cuota no hay descuentos', () => {
    const installment = {
      ...PAYOUT,
      type: 'payment',
      kind: 'installment',
      amount: pen(3_360),
    } as const;
    expect(TransactionDetailResponse.fromDetail(installment).deductions).toBeNull();
  });

  it('un movimiento que no es del usuario responde TRANSACTION_NOT_FOUND', async () => {
    const transactionOf = jest.fn().mockResolvedValue(null);
    const useCase = new GetTransactionUseCase({
      installment: jest.fn(),
      dueInstallmentsOf: jest.fn(),
      transactionsOf: jest.fn(),
      transactionOf,
      installmentHistoryOf: jest.fn(),
    });
    await expect(
      useCase.execute({ userId: 'u-1' }, { type: 'payout', id: 't-1' }),
    ).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
    expect(transactionOf).toHaveBeenCalledWith({ userId: 'u-1', type: 'payout', id: 't-1' });
  });
});
