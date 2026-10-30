import { type DueInstallment } from '@src/modules/circles/application/ports/payments-query.port';
import { GetPaymentSummaryUseCase } from '@src/modules/circles/application/use-cases/get-payment-summary.use-case';
import { PaymentSummaryResponse } from '@src/modules/circles/presentation/http/dto/payment-summary.dto';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { NO_DEBTS } from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const due = (circleId: string, dueOn: string, amount: number): DueInstallment => ({
  circleId,
  period: Period.parse(dueOn.slice(0, 7)),
  dueOn: LocalDate.parse(dueOn),
  amount: pen(amount),
  status: 'pending',
});

function useCase(dues: DueInstallment[], debts = NO_DEBTS) {
  return new GetPaymentSummaryUseCase(
    {
      dueInstallmentsOf: () => Promise.resolve(dues),
      transactionsOf: jest.fn(),
      installment: jest.fn(),
    },
    debts,
  );
}

describe('GetPaymentSummaryUseCase (COPAYNI-35)', () => {
  it('sin cuotas ni deudas no tiene pagos pendientes', async () => {
    const summary = await useCase([]).execute({ userId: 'u-1' });
    expect(PaymentSummaryResponse.from(summary)).toEqual({
      hasDuePayments: false,
      totalDue: null,
      nextDueOn: null,
      debt: null,
      duePayments: [],
    });
  });

  it('suma las cuotas por pagar, da el próximo vencimiento y la deuda por impago', async () => {
    const summary = await useCase(
      [due('c-1', '2026-12-05', 3_000), due('c-2', '2026-12-05', 1_200)],
      {
        ...NO_DEBTS,
        openDebtsOf: () =>
          Promise.resolve([{ circleId: 'c-9', overdue: pen(3_000), lateFee: pen(90) }]),
      },
    ).execute({ userId: 'u-1' });

    expect(PaymentSummaryResponse.from(summary)).toMatchObject({
      hasDuePayments: true,
      totalDue: { amount: 420_000, currency: 'PEN' },
      nextDueOn: '2026-12-05',
      debt: { amount: 309_000, currency: 'PEN' },
    });
    expect(PaymentSummaryResponse.from(summary).duePayments[0]).toEqual({
      circleId: 'c-1',
      period: '2026-12',
      dueOn: '2026-12-05',
      amount: { amount: 300_000, currency: 'PEN' },
      status: 'pending',
    });
  });

  it('solo con una deuda por impago también tiene pagos pendientes', async () => {
    const summary = await useCase([], {
      ...NO_DEBTS,
      openDebtsOf: () => Promise.resolve([{ circleId: 'c-9', overdue: pen(10), lateFee: pen(1) }]),
    }).execute({ userId: 'u-1' });
    expect(PaymentSummaryResponse.from(summary).hasDuePayments).toBe(true);
  });
});
