import { AppError } from '@/domain/shared/errors/AppError';
import type { HttpClientPort, HttpRequestOptions } from '@/domain/shared/ports/HttpClientPort';
import { Money } from '@/domain/shared/value-objects/Money';

import { CardApiRepository } from './CardApiRepository';
import { PaymentApiRepository } from './PaymentApiRepository';

function httpReturning(data: unknown) {
  const calls: { path: string; options: HttpRequestOptions<unknown> }[] = [];
  const http = {
    get: jest.fn((path: string, options: HttpRequestOptions<unknown>) => {
      calls.push({ path, options });
      return Promise.resolve(options.parse ? options.parse(data) : data);
    }),
    post: jest.fn((path: string, options: HttpRequestOptions<unknown>) => {
      calls.push({ path, options });
      return Promise.resolve(options.parse ? options.parse(data) : data);
    }),
    put: jest.fn((path: string, options: HttpRequestOptions<unknown>) => {
      calls.push({ path, options });
      return Promise.resolve(options.parse ? options.parse(data) : data);
    }),
    delete: jest.fn((path: string, options: HttpRequestOptions<unknown> = {}) => {
      calls.push({ path, options });
      return Promise.resolve(undefined);
    }),
    patch: jest.fn((path: string, options: HttpRequestOptions<unknown>) => {
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
          installmentId: 'i-1',
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

  it('traduce la elegibilidad e ignora requisitos que esta versión no conoce', async () => {
    const { http, calls } = httpReturning({
      isEligible: false,
      requirements: [
        { requirement: 'national_id', status: 'met' },
        { requirement: 'due_payments', status: 'pending' },
        { requirement: 'selfie', status: 'pending' },
      ],
    });
    const eligibility = await new PaymentApiRepository(http).getPayoutEligibility();
    expect(calls[0]!.path).toBe('/me/payout-eligibility');
    expect(eligibility.requirements).toEqual([
      { requirement: 'nationalId', status: 'met' },
      { requirement: 'duePayments', status: 'pending' },
    ]);
  });

  it('lee y guarda las preferencias de pago', async () => {
    const { http, calls } = httpReturning({ deductPayInFromPayout: true });
    const repository = new PaymentApiRepository(http);
    await expect(repository.getSettings()).resolves.toEqual({ deductPayInFromPayout: true });
    await expect(repository.updateSettings({ deductPayInFromPayout: true })).resolves.toEqual({
      deductPayInFromPayout: true,
    });
    expect(calls[1]).toMatchObject({
      path: '/me/payment-settings',
      options: { body: { deductPayInFromPayout: true } },
    });
  });

  it('paga una cuota con la clave de idempotencia y el método', async () => {
    const { http, calls } = httpReturning({ status: 'pending', paymentId: 'mp-1' });
    await expect(
      new PaymentApiRepository(http).payInstallment('i 1', { method: 'yape', token: 't' }, 'key'),
    ).resolves.toEqual({ status: 'pending', paymentId: 'mp-1' });
    expect(calls[0]).toMatchObject({
      path: '/me/installments/i%201/pay',
      options: { idempotencyKey: 'key', body: { method: 'yape', token: 't' } },
    });
  });
});

const CARD = {
  id: 'card-1',
  brand: 'visa',
  lastFour: '0215',
  expirationMonth: 11,
  expirationYear: 2029,
  isDefault: true,
};

describe('CardApiRepository', () => {
  it('lista, agrega con idempotencia, cambia la predeterminada y borra', async () => {
    const list = httpReturning({ items: [CARD] });
    await expect(new CardApiRepository(list.http).list()).resolves.toEqual([CARD]);

    const add = httpReturning(CARD);
    await new CardApiRepository(add.http).add('tok', 'key-1');
    expect(add.calls[0]).toMatchObject({
      path: '/me/cards',
      options: { idempotencyKey: 'key-1', body: { token: 'tok' } },
    });

    const setDefault = httpReturning({ items: [CARD] });
    await new CardApiRepository(setDefault.http).setDefault('card-1');
    expect(setDefault.calls[0]!.path).toBe('/me/cards/card-1/default');

    const remove = httpReturning(undefined);
    await new CardApiRepository(remove.http).remove('card-1');
    expect(remove.calls[0]!.path).toBe('/me/cards/card-1');
  });
});
