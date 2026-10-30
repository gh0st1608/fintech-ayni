import { AppError } from '@/domain/shared/errors/AppError';
import type { HttpClientPort, HttpRequestOptions } from '@/domain/shared/ports/HttpClientPort';
import { Money } from '@/domain/shared/value-objects/Money';

import { PaymentApiRepository } from './PaymentApiRepository';

function httpReturning(data: unknown) {
  const calls: { path: string; options: HttpRequestOptions<unknown> }[] = [];
  const http = {
    get: jest.fn((path: string, options: HttpRequestOptions<unknown>) => {
      calls.push({ path, options });
      return Promise.resolve(options.parse ? options.parse(data) : data);
    }),
  } as unknown as HttpClientPort;
  return { http, calls };
}

describe('PaymentApiRepository', () => {
  it('mapea el resumen a Money', async () => {
    const { http, calls } = httpReturning({
      hasDuePayments: true,
      totalDue: { amount: 560000, currency: 'PEN' },
      nextDueOn: '2026-12-05',
      debt: { amount: 10000, currency: 'PEN' },
      duePayments: [
        {
          circleId: 'c-1',
          period: '2026-12',
          dueOn: '2026-12-05',
          amount: { amount: 560000, currency: 'PEN' },
          status: 'overdue',
        },
      ],
    });
    const summary = await new PaymentApiRepository(http).getSummary();
    expect(calls[0]!.path).toBe('/me/payments/summary');
    expect(summary.totalDue).toEqual(Money.of(560000, 'PEN'));
    expect(summary.debt).toEqual(Money.of(10000, 'PEN'));
    expect(summary.duePayments[0]).toMatchObject({ status: 'overdue', dueOn: '2026-12-05' });
  });

  it('pide el historial por tipo y cursor y traduce el tipo de movimiento', async () => {
    const { http, calls } = httpReturning({
      items: [
        {
          id: 't-1',
          type: 'payment',
          kind: 'debt_settlement',
          circleId: 'c-1',
          period: null,
          amount: { amount: 525000, currency: 'PEN' },
          occurredAt: '2026-12-05T17:00:00.000Z',
        },
      ],
      nextCursor: 'abc',
    });
    const page = await new PaymentApiRepository(http).listTransactions('payment', 'x');
    expect(calls[0]).toMatchObject({
      path: '/me/transactions',
      options: { query: { type: 'payment', cursor: 'x' } },
    });
    expect(page.items[0]).toMatchObject({ kind: 'debtSettlement', period: null });
    expect(page.items[0]!.occurredAt).toEqual(new Date('2026-12-05T17:00:00.000Z'));
    expect(page.nextCursor).toBe('abc');
  });

  it('rechaza una respuesta que no cumple el contrato', async () => {
    const { http } = httpReturning({ hasDuePayments: 'sí' });
    await expect(new PaymentApiRepository(http).getSummary()).rejects.toBeTruthy();
    void AppError;
  });
});
