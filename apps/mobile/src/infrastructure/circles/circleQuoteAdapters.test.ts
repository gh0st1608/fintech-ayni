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

const SLOTS = {
  circleId: 'c-1',
  payout: money(3_000_000),
  months: 10,
  slots: [
    {
      position: 1,
      payoutPeriod: '2026-11',
      type: 'fastest_payout',
      fee: money(300_000),
      discount: money(0),
      available: false,
    },
    {
      position: 10,
      payoutPeriod: '2027-08',
      type: 'highest_return',
      fee: money(0),
      discount: money(150_000),
      available: true,
    },
  ],
};

describe('CircleQuoteApiRepository.listSlots', () => {
  it('pide los slots del payout y la duración y mapea los tipos', async () => {
    const { fetchImpl, repository } = setup(SLOTS);
    const slots = await repository.listSlots(pen(30_000), 10);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.test/v1/circles/slots?payoutAmount=3000000&months=10',
    );
    expect(slots.map(({ position, type, available }) => [position, type, available])).toEqual([
      [1, 'fastestPayout', false],
      [10, 'highestReturn', true],
    ]);
    expect(slots[1]?.discount.equals(pen(1_500))).toBe(true);
    expect(slots.every(({ circleId }) => circleId === 'c-1')).toBe(true);
  });

  it('un círculo nuevo llega con circleId null', async () => {
    const { repository } = setup({ ...SLOTS, circleId: null });
    const slots = await repository.listSlots(pen(30_000), 10);
    expect(slots[0]?.circleId).toBeNull();
  });

  it.each([
    [{ ...SLOTS, slots: [{ ...SLOTS.slots[0], type: 'vip' }] }],
    [{ ...SLOTS, slots: [{ ...SLOTS.slots[0], payoutPeriod: 'noviembre' }] }],
    [{ ...SLOTS, slots: [{ ...SLOTS.slots[0], available: undefined }] }],
    [{ ...SLOTS, circleId: undefined }],
  ])('rechaza una respuesta que no cumple el contrato', async (body) => {
    const { repository } = setup(body);
    await expect(repository.listSlots(pen(30_000), 10)).rejects.toThrow();
  });
});

describe('InMemoryCircleQuoteRepository.listSlots', () => {
  it('aplica los parámetros provisionales: fee lineal al inicio y descuento al final', async () => {
    const slots = await new InMemoryCircleQuoteRepository({
      latencyMs: 0,
      startsOn: '2026-11',
    }).listSlots(pen(30_000), 10);

    expect(slots.map(({ payoutPeriod }) => payoutPeriod)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
    ]);
    expect(slots.map(({ fee }) => fee.toMajor())).toEqual([3_000, 1_500, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(slots.map(({ discount }) => discount.toMajor())).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 750, 1_500,
    ]);
  });

  it('empieza el mes siguiente al actual y permite ocupar slots', async () => {
    const repository = new InMemoryCircleQuoteRepository({ latencyMs: 0 });
    repository.take(3);
    const slots = await repository.listSlots(pen(30_000), 10);
    const next = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    expect(slots[0]?.payoutDate.getTime()).toBe(next.getTime());
    expect(slots.filter(({ available }) => !available).map(({ position }) => position)).toEqual([
      3,
    ]);
  });
});

const RECOMMENDED = {
  items: [
    {
      circleId: 'r-1',
      payout: money(3_000_000),
      months: 10,
      startsOn: '2026-11',
      endsOn: '2027-08',
      baseInstallment: money(300_000),
      adminFee: money(360_000),
      availableSlots: 7,
    },
  ],
};

describe('CircleQuoteApiRepository.listRecommended', () => {
  it('pide los recomendados y mapea los montos', async () => {
    const { fetchImpl, repository } = setup(RECOMMENDED);
    const [circle] = await repository.listRecommended();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.test/v1/circles/recommended');
    expect(circle).toMatchObject({
      circleId: 'r-1',
      months: 10,
      endsOn: '2027-08',
      availableSlots: 7,
    });
    expect(circle?.baseInstallment.equals(pen(3_000))).toBe(true);
    expect(circle?.adminFee.equals(pen(3_600))).toBe(true);
  });

  it.each([
    [{ items: [{ ...RECOMMENDED.items[0], availableSlots: 0 }] }],
    [{ items: [{ ...RECOMMENDED.items[0], endsOn: 'agosto' }] }],
    [{}],
  ])('rechaza una respuesta que no cumple el contrato', async (body) => {
    const { repository } = setup(body);
    await expect(repository.listRecommended()).rejects.toThrow();
  });

  it('el adaptador falso no recomienda nada por defecto', async () => {
    await expect(
      new InMemoryCircleQuoteRepository({ latencyMs: 0 }).listRecommended(),
    ).resolves.toEqual([]);
  });
});
