import { GetJoinConfigUseCase } from '@/application/circles/usecases/GetJoinConfigUseCase';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { InMemoryJoinConfigRepository } from './InMemoryJoinConfigRepository';
import { JoinConfigApiRepository } from './JoinConfigApiRepository';

const money = (amount: number, currency = 'PEN') => ({ amount, currency });

const CONFIG = {
  payout: { min: money(300_000), max: money(12_000_000), step: money(50_000) },
  userPayoutLimit: money(2_000_000),
  savingProgramMax: money(100_000_000),
  currencies: [
    { code: 'PEN', official: true, rateToOfficial: '1' },
    { code: 'USD', official: false, rateToOfficial: '3.75' },
  ],
  termsVersion: '2026-11',
};

function setup(body: unknown) {
  const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  fetchImpl.mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: body }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const http = new FetchHttpClient({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { fetchImpl, repository: new JoinConfigApiRepository(http) };
}

describe('JoinConfigApiRepository', () => {
  it('pide la configuración y mapea los montos a Money', async () => {
    const { fetchImpl, repository } = setup(CONFIG);
    const config = await new GetJoinConfigUseCase(repository).execute();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.test/v1/circles/join-config');
    expect(config.payoutRange.min.equals(Money.of(300_000, 'PEN'))).toBe(true);
    expect(config.payoutRange.step.amount).toBe(50_000);
    expect(config.userPayoutLimit?.equals(Money.of(2_000_000, 'PEN'))).toBe(true);
    expect(config.savingProgramMax.amount).toBe(100_000_000);
    expect(config.currencies.map(({ code }) => code)).toEqual(['PEN', 'USD']);
  });

  it('pide la configuración en la moneda elegida (pending-scope M2)', async () => {
    const { fetchImpl, repository } = setup(CONFIG);
    await new GetJoinConfigUseCase(repository).execute(undefined, 'USD');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.test/v1/circles/join-config?currency=USD',
    );
  });

  it('un límite nulo significa que el usuario no está restringido', async () => {
    const { repository } = setup({ ...CONFIG, userPayoutLimit: null });
    expect((await repository.get()).userPayoutLimit).toBeUndefined();
  });

  it.each([
    [{ ...CONFIG, payout: { ...CONFIG.payout, step: money(0.5) } }],
    [{ ...CONFIG, savingProgramMax: money(1, 'soles') }],
    [{ ...CONFIG, payout: undefined }],
    [{ ...CONFIG, currencies: [] }],
    [{ ...CONFIG, currencies: [{ code: 'USD', official: false, rateToOfficial: '3,75' }] }],
  ])('rechaza una respuesta que no cumple el contrato', async (body) => {
    const { repository } = setup(body);
    await expect(repository.get()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('InMemoryJoinConfigRepository', () => {
  it('usa la moneda configurada y los valores provisionales del Figma', async () => {
    const config = await new InMemoryJoinConfigRepository('PEN', { latencyMs: 0 }).get();
    expect(config.payoutRange.min.equals(Money.fromMajor(3000, 'PEN'))).toBe(true);
    expect(config.payoutRange.max.equals(Money.fromMajor(120000, 'PEN'))).toBe(true);
    expect(config.userPayoutLimit).toBeUndefined();
  });

  it('permite simular el límite del usuario', async () => {
    const repository = new InMemoryJoinConfigRepository('PEN', {
      latencyMs: 0,
      userPayoutLimit: 20000,
    });
    expect((await repository.get()).userPayoutLimit?.toMajor()).toBe(20000);
  });

  it('con una segunda moneda, la ofrece y devuelve sus montos equivalentes', async () => {
    const repository = new InMemoryJoinConfigRepository('PEN', {
      latencyMs: 0,
      secondCurrency: { code: 'USD', rateToOfficial: '3.75' },
    });
    const config = await repository.get(undefined, 'USD');
    expect(config.payoutRange.min.equals(Money.fromMajor(800, 'USD'))).toBe(true);
    expect(config.payoutRange.step.equals(Money.fromMajor(100, 'USD'))).toBe(true);
    expect(config.currencies.map(({ code }) => code)).toEqual(['PEN', 'USD']);
    await expect(repository.get(undefined, 'EUR')).rejects.toMatchObject({ kind: 'validation' });
  });

  it('respeta la cancelación', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new InMemoryJoinConfigRepository('PEN').get(controller.signal),
    ).rejects.toMatchObject(new AppError('cancelled', 'Request cancelled'));
  });
});
