import { Money } from '@/domain/shared/value-objects/Money';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { CircleMembershipApiRepository } from './CircleMembershipApiRepository';
import { InMemoryCircleMembershipRepository } from './InMemoryCircleMembershipRepository';

const money = (amount: number, currency = 'PEN') => ({ amount, currency });
const pen = (major: number) => Money.fromMajor(major, 'PEN');
const REQUEST = { circleId: null, payout: pen(30_000), months: 10, position: 3 };

const JOINED = {
  circleId: '6f1c2b0e-0000-4000-8000-000000000001',
  startsOn: '2026-11',
  payout: money(3_000_000),
  months: 10,
  position: 3,
  payoutPeriod: '2027-01',
  type: 'lowest_fees',
  installments: Array.from({ length: 10 }, () => money(336_000)),
  netPayout: money(3_000_000),
  created: true,
};

function setup(response: { status?: number; body: unknown }) {
  const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  fetchImpl.mockResolvedValue(
    new Response(JSON.stringify(response.body), {
      status: response.status ?? 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const http = new FetchHttpClient({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { fetchImpl, repository: new CircleMembershipApiRepository(http) };
}

describe('CircleMembershipApiRepository', () => {
  it('envía el pedido con la Idempotency-Key y mapea la unión', async () => {
    const { fetchImpl, repository } = setup({ body: { success: true, data: JOINED } });
    const joined = await repository.join(REQUEST, 'clave-0000000001');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/circles/join');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe('clave-0000000001');
    expect(JSON.parse(init?.body as string)).toEqual({
      circleId: null,
      payoutAmount: 3_000_000,
      months: 10,
      position: 3,
    });
    expect(joined).toMatchObject({ circleId: JOINED.circleId, type: 'lowestFees', created: true });
    expect(joined.installments[0]?.toMajor()).toBe(3_360);
    expect(joined.netPayout.equals(pen(30_000))).toBe(true);
  });

  it.each([
    [{ ...JOINED, type: 'vip' }],
    [{ ...JOINED, payoutPeriod: 'enero' }],
    [{ ...JOINED, installments: [] }],
    [{ ...JOINED, created: undefined }],
  ])('rechaza una respuesta que no cumple el contrato', async (data) => {
    const { repository } = setup({ body: { success: true, data } });
    await expect(repository.join(REQUEST, 'k')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('conserva el código del rechazo del backend', async () => {
    const { repository } = setup({
      status: 422,
      body: {
        success: false,
        error: { code: 'NATIONAL_ID_REQUIRED', message: 'no' },
        traceId: 't',
      },
    });
    await expect(repository.join(REQUEST, 'k')).rejects.toMatchObject({
      kind: 'validation',
      code: 'NATIONAL_ID_REQUIRED',
    });
  });
});

describe('InMemoryCircleMembershipRepository', () => {
  it('abre un círculo nuevo y repite la unión con la misma clave', async () => {
    const repository = new InMemoryCircleMembershipRepository({
      latencyMs: 0,
      startsOn: '2026-11',
    });
    const joined = await repository.join(REQUEST, 'k');
    expect(joined).toMatchObject({ payoutPeriod: '2027-01', created: true });
    expect(joined.installments.every((installment) => installment.equals(pen(3_000)))).toBe(true);

    await expect(repository.join(REQUEST, 'k')).resolves.toMatchObject({
      circleId: joined.circleId,
      created: false,
    });
    expect(repository.joinCount).toBe(1);
  });

  it('se une al círculo ofrecido', async () => {
    const repository = new InMemoryCircleMembershipRepository({ latencyMs: 0 });
    await expect(repository.join({ ...REQUEST, circleId: 'c-1' }, 'k')).resolves.toMatchObject({
      circleId: 'c-1',
    });
  });

  it('simula un rechazo una sola vez', async () => {
    const repository = new InMemoryCircleMembershipRepository({
      latencyMs: 0,
      rejectWith: 'PAYOUT_METHOD_REQUIRED',
    });
    await expect(repository.join(REQUEST, 'k')).rejects.toMatchObject({
      kind: 'validation',
      code: 'PAYOUT_METHOD_REQUIRED',
    });
    repository.rejectNextWith('SLOT_TAKEN');
    await expect(repository.join(REQUEST, 'k')).rejects.toMatchObject({ kind: 'conflict' });
    await expect(repository.join(REQUEST, 'k')).resolves.toMatchObject({ created: true });
  });
});
