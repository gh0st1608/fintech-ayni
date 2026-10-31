import {
  GetSavingQuoteUseCase,
  ListSavingPlansUseCase,
} from '@/application/savings/usecases/savingUseCases';
import { InvalidSavingQuoteError } from '@/domain/savings/SavingPlan';
import type { HttpRequestOptions, HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { Money } from '@/domain/shared/value-objects/Money';

import { InMemorySavingPlanRepository } from './InMemorySavingPlanRepository';
import { SavingPlanApiRepository } from './SavingPlanApiRepository';

function httpReturning(data: unknown) {
  const calls: { path: string; options: HttpRequestOptions<unknown> }[] = [];
  const get = jest.fn((path: string, options: HttpRequestOptions<unknown> = {}) => {
    calls.push({ path, options });
    return Promise.resolve(options.parse ? options.parse(data) : data);
  });
  return { http: { get } as unknown as HttpClientPort, calls };
}

const pen = (amount: number) => ({ amount, currency: 'PEN' });

const QUOTE = {
  planId: 'lite',
  months: 6,
  monthlyInstallment: pen(50000),
  installments: Array.from({ length: 6 }, () => pen(50000)),
  target: pen(300000),
  cashback: pen(15000),
  total: pen(315000),
  startsOn: '2026-12',
  payoutPeriod: '2027-06',
};

describe('SavingPlanApiRepository', () => {
  it('traduce el catálogo con las duraciones', async () => {
    const { http, calls } = httpReturning({
      items: [{ id: 'lite', target: pen(300000), maxCashback: pen(60000) }],
      durations: [6, 12, 24],
    });
    await expect(new SavingPlanApiRepository(http).list()).resolves.toEqual({
      plans: [{ id: 'lite', target: Money.of(300000, 'PEN'), maxCashback: Money.of(60000, 'PEN') }],
      durations: [6, 12, 24],
    });
    expect(calls[0]!.path).toBe('/savings/plans');
  });

  it('pide la cotización con los meses y traduce los montos', async () => {
    const { http, calls } = httpReturning(QUOTE);
    const quote = await new SavingPlanApiRepository(http).quote('lite', 6);
    expect(calls[0]).toMatchObject({
      path: '/savings/plans/lite/quote',
      options: { query: { months: 6 } },
    });
    expect(quote.total).toEqual(Money.of(315000, 'PEN'));
    expect(quote.installments).toHaveLength(6);
    expect(quote.payoutPeriod).toBe('2027-06');
  });

  it('rechaza un periodo mal formado', async () => {
    const { http } = httpReturning({ ...QUOTE, startsOn: 'Dec 2026' });
    await expect(new SavingPlanApiRepository(http).quote('lite', 6)).rejects.toThrow();
  });

  it('el caso de uso no entrega fechas incoherentes del backend', async () => {
    const { http } = httpReturning({ ...QUOTE, startsOn: '2027-06', payoutPeriod: '2026-12' });
    await expect(
      new GetSavingQuoteUseCase(new SavingPlanApiRepository(http)).execute('lite', 6),
    ).rejects.toThrow(InvalidSavingQuoteError);
  });
});

describe('InMemorySavingPlanRepository', () => {
  const repository = new InMemorySavingPlanRepository({
    latencyMs: 0,
    currency: 'PEN',
    now: () => new Date(2026, 9, 31),
  });

  it('ofrece los planes del menor al mayor con el cashback a 24 meses', async () => {
    const catalog = await new ListSavingPlansUseCase(repository).execute();
    expect(catalog.durations).toEqual([6, 12, 24]);
    expect(catalog.plans[0]).toEqual({
      id: 'lite',
      target: Money.of(300000, 'PEN'),
      maxCashback: Money.of(60000, 'PEN'),
    });
  });

  it('cotiza como el backend: empieza el mes siguiente y paga después de la última cuota', async () => {
    const quote = await new GetSavingQuoteUseCase(repository).execute('lite', 6);
    expect(quote).toMatchObject({ startsOn: '2026-11', payoutPeriod: '2027-05' });
    expect(quote.cashback).toEqual(Money.of(15000, 'PEN'));
    expect(quote.total).toEqual(Money.of(315000, 'PEN'));
  });

  it('reparte un monto inexacto con un céntimo más en las primeras cuotas', async () => {
    const odd = new InMemorySavingPlanRepository({
      latencyMs: 0,
      currency: 'PEN',
      plans: { x: 100 },
    });
    const quote = await new GetSavingQuoteUseCase(odd).execute('x', 6);
    expect(quote.installments.map(({ amount }) => amount)).toEqual([17, 17, 17, 17, 16, 16]);
    expect(quote.monthlyInstallment.amount).toBe(17);
  });

  it.each([
    ['otro plan', 'nope', 6, 'not_found'],
    ['otra duración', 'lite', 7, 'validation'],
  ])('rechaza %s', async (_case, planId, months, kind) => {
    await expect(repository.quote(planId as string, months as number)).rejects.toMatchObject({
      kind,
    });
  });
});
