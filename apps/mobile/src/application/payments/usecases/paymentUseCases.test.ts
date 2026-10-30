import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { Money } from '@/domain/shared/value-objects/Money';

import { GetPaymentSummaryUseCase, ListTransactionsUseCase } from './paymentUseCases';

describe('Casos de uso de pagos', () => {
  it('sin círculos, el resumen no tiene pagos pendientes', async () => {
    const repository = new InMemoryPaymentRepository('PEN', { latencyMs: 0 });
    await expect(new GetPaymentSummaryUseCase(repository).execute()).resolves.toEqual({
      hasDuePayments: false,
      totalDue: null,
      nextDueOn: null,
      debt: null,
      duePayments: [],
    });
  });

  it('con cuotas, devuelve el total y el próximo vencimiento', async () => {
    const repository = new InMemoryPaymentRepository('PEN', {
      latencyMs: 0,
      withDuePayments: true,
    });
    const summary = await new GetPaymentSummaryUseCase(repository).execute();
    expect(summary.hasDuePayments).toBe(true);
    expect(summary.totalDue).toEqual(Money.fromMajor(5_600, 'PEN'));
    expect(summary.nextDueOn).toBe('2026-12-05');
  });

  it('pagina el historial por tipo', async () => {
    const repository = new InMemoryPaymentRepository('PEN', {
      latencyMs: 0,
      withDuePayments: true,
      pageSize: 1,
    });
    const listTransactions = new ListTransactionsUseCase(repository);
    const first = await listTransactions.execute('payment', null);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await listTransactions.execute('payment', first.nextCursor);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    const payouts = await listTransactions.execute('payout', null);
    expect(payouts.items.every((item) => item.type === 'payout')).toBe(true);
  });
});
