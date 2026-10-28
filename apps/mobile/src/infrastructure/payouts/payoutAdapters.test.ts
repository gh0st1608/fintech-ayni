import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { InMemoryPayoutMethodRepository } from './InMemoryPayoutMethodRepository';
import { PayoutMethodApiRepository } from './PayoutMethodApiRepository';

const money = (amount: number, currency = 'PEN') => ({ amount, currency });

const METHODS = {
  methods: [
    { type: 'digital_wallet', available: true, badges: [], limit: null },
    {
      type: 'prepaid_card',
      available: true,
      badges: ['no_charge', 'futuro'],
      limit: money(10_000_000),
    },
    { type: 'fawry', available: false, badges: [], limit: null },
  ],
  selected: 'prepaid_card',
};

function setup(response: { status?: number; body: unknown }) {
  const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  fetchImpl.mockResolvedValue(
    new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const http = new FetchHttpClient({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { fetchImpl, repository: new PayoutMethodApiRepository(http) };
}

describe('PayoutMethodApiRepository', () => {
  it('lista el catálogo y mapea tipos, badges y límite', async () => {
    const { fetchImpl, repository } = setup({ body: { success: true, data: METHODS } });
    const { methods, selected } = await repository.list();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.test/v1/me/payout-method');
    expect(selected).toBe('prepaidCard');
    expect(methods.map(({ type, available }) => [type, available])).toEqual([
      ['digitalWallet', true],
      ['prepaidCard', true],
      ['fawry', false],
    ]);
    // Un badge desconocido se ignora.
    expect(methods[1]?.badges).toEqual(['noCharge']);
    expect(methods[1]?.isFree).toBe(true);
    expect(methods[1]?.limit?.toMajor()).toBe(100_000);
    expect(methods[0]?.limit).toBeNull();
  });

  it('guarda con PUT y el tipo del contrato', async () => {
    const { fetchImpl, repository } = setup({
      body: { success: true, data: { ...METHODS, selected: 'digital_wallet' } },
    });
    await expect(repository.select('digitalWallet')).resolves.toMatchObject({
      selected: 'digitalWallet',
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({ method: 'digital_wallet' });
  });

  it('acepta un catálogo sin método elegido', async () => {
    const { repository } = setup({ body: { success: true, data: { ...METHODS, selected: null } } });
    await expect(repository.list()).resolves.toMatchObject({ selected: null });
  });

  it.each([
    [{ ...METHODS, methods: [{ ...METHODS.methods[0], type: 'cheque' }] }],
    [{ ...METHODS, methods: [{ ...METHODS.methods[0], available: 'si' }] }],
    [{ methods: METHODS.methods }],
  ])('rechaza una respuesta que no cumple el contrato', async (data) => {
    const { repository } = setup({ body: { success: true, data } });
    await expect(repository.list()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('conserva el código del rechazo del backend', async () => {
    const { repository } = setup({
      status: 422,
      body: {
        success: false,
        error: { code: 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED', message: 'no' },
        traceId: 't',
      },
    });
    await expect(repository.select('bankTransfer')).rejects.toMatchObject({
      code: 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED',
    });
  });
});

describe('InMemoryPayoutMethodRepository', () => {
  it('ofrece el mismo catálogo provisional que el backend en la moneda configurada', async () => {
    const { methods, selected } = await new InMemoryPayoutMethodRepository('PEN', {
      latencyMs: 0,
    }).list();
    expect(selected).toBeNull();
    expect(methods.map(({ type }) => type)).toEqual([
      'digitalWallet',
      'prepaidCard',
      'bankTransfer',
    ]);
    expect(methods[1]?.limit?.currency).toBe('PEN');
    expect(methods.filter(({ isFree }) => isFree).map(({ type }) => type)).toEqual([
      'prepaidCard',
      'bankTransfer',
    ]);
  });

  it('guarda el método y simula el bloqueo del mes de payout', async () => {
    const repository = new InMemoryPayoutMethodRepository('PEN', {
      latencyMs: 0,
      selected: 'prepaidCard',
      changeLocked: true,
    });
    await expect(repository.select('bankTransfer')).rejects.toMatchObject({
      code: 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED',
    });
    await expect(repository.select('fawry')).rejects.toMatchObject({
      code: 'PAYOUT_METHOD_NOT_AVAILABLE',
    });
    await expect(repository.select('prepaidCard')).resolves.toMatchObject({
      selected: 'prepaidCard',
    });
  });

  it('respeta la cancelación', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new InMemoryPayoutMethodRepository('PEN').list(controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
