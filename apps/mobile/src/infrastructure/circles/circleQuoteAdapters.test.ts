import { ListInstallmentOptionsUseCase } from '@/application/circles/usecases/ListInstallmentOptionsUseCase';
import { Money } from '@/domain/shared/value-objects/Money';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { CircleQuoteApiRepository } from './CircleQuoteApiRepository';
import { InMemoryCircleQuoteRepository } from './InMemoryCircleQuoteRepository';

const money = (amount: number, currency = 'PEN') => ({ amount, currency });
const pen = (major: number) => Money.fromMajor(major, 'PEN');

const OPTIONS = {
  payout: money(3_000_000),
  options: [
    { months: 12, installment: money(250_000) },
    { months: 6, installment: money(500_000), withinMonthlyLimit: false },
    { months: 10, installment: money(300_000) },
  ],
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
  return { fetchImpl, repository: new CircleQuoteApiRepository(http) };
}

describe('CircleQuoteApiRepository', () => {
  it('pide las cuotas del payout en unidades menores y las ordena por duración', async () => {
    const { fetchImpl, repository } = setup(OPTIONS);
    const options = await new ListInstallmentOptionsUseCase(repository).execute(pen(30_000));

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.test/v1/circles/installment-options?payoutAmount=3000000',
    );
    expect(options.map(({ months }) => months)).toEqual([6, 10, 12]);
    expect(options[0]?.installment.equals(pen(5_000))).toBe(true);
    expect(options[0]?.withinMonthlyLimit).toBe(false);
    // Sin el campo propuesto, la opción no se restringe.
    expect(options[1]?.withinMonthlyLimit).toBe(true);
  });

  it('acepta una lista vacía', async () => {
    const { repository } = setup({ ...OPTIONS, options: [] });
    await expect(repository.listInstallmentOptions(pen(30_000))).resolves.toEqual([]);
  });

  it.each([
    [{ ...OPTIONS, options: [{ months: 0, installment: money(1) }] }],
    [{ ...OPTIONS, options: [{ months: 6, installment: money(0.5) }] }],
    [{ payout: OPTIONS.payout }],
  ])('rechaza una respuesta que no cumple el contrato', async (body) => {
    const { repository } = setup(body);
    await expect(repository.listInstallmentOptions(pen(30_000))).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('InMemoryCircleQuoteRepository', () => {
  it('ofrece las duraciones del Figma con cuotas exactas', async () => {
    const options = await new InMemoryCircleQuoteRepository({
      latencyMs: 0,
    }).listInstallmentOptions(pen(30_000));
    expect(options.map(({ months, installment }) => [months, installment.toMajor()])).toEqual([
      [6, 5_000],
      [10, 3_000],
      [12, 2_500],
    ]);
  });

  it('omite las duraciones sin cuota exacta en céntimos', async () => {
    const options = await new InMemoryCircleQuoteRepository({
      latencyMs: 0,
    }).listInstallmentOptions(Money.of(1_000_000, 'PEN'));
    expect(options.map(({ months }) => months)).toEqual([10]);
  });

  it('permite simular el límite mensual del usuario', async () => {
    const options = await new InMemoryCircleQuoteRepository({
      latencyMs: 0,
      monthlyPayInLimit: 3_000,
    }).listInstallmentOptions(pen(30_000));
    expect(options.map(({ withinMonthlyLimit }) => withinMonthlyLimit)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('respeta la cancelación', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new InMemoryCircleQuoteRepository().listInstallmentOptions(pen(30_000), controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
