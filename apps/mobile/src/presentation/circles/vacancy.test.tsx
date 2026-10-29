import { fireEvent, screen } from '@testing-library/react-native';

import { JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import { firstInstallmentOf } from '@/domain/circles/JoinedCircle';
import { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import { InvalidSlotError, Slot } from '@/domain/circles/value-objects/Slot';
import { Money } from '@/domain/shared/value-objects/Money';
import { CircleQuoteApiRepository } from '@/infrastructure/circles/CircleQuoteApiRepository';
import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { HomeScreen } from '@/presentation/home/screens/HomeScreen';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { recommendedCircle } from '@test/fakes/myCircles';
import { renderWithProviders } from '@test/renderWithProviders';

/** Turno vacante de un círculo en curso (COPAYNI-59). */
const pen = (major: number) => Money.fromMajor(major, 'PEN');
const VACANCY = recommendedCircle({
  circleId: 'v-1',
  availableSlots: 1,
  vacancies: [{ position: 7, payoutPeriod: '2027-05' }],
});

function api(body: unknown) {
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

const money = (amount: number) => ({ amount, currency: 'PEN' });

describe('Vacante en Home', () => {
  it('muestra el turno vacante con su mes de cobro y entra al flujo con ese círculo', async () => {
    const handlers = { onJoinCircle: jest.fn(), onJoin: jest.fn() };
    await renderWithProviders(
      <HomeScreen {...handlers} />,
      createTestContainer({
        circleQuote: new InMemoryCircleQuoteRepository({ latencyMs: 0, recommended: [VACANCY] }),
      }),
    );

    const card = await screen.findByTestId('recommended-v-1');
    expect(card).toHaveTextContent(/Turno vacante · cobras en may\.? 2027/i);
    await fireEvent.press(screen.getByRole('button', { name: 'Únete ahora' }));
    expect(handlers.onJoinCircle).toHaveBeenCalledWith(VACANCY.payout, {
      circleId: 'v-1',
      months: 10,
    });
  });
});

describe('Borrador desde un recomendado', () => {
  const ten = InstallmentOption.create({ months: 10, installment: pen(3_000) });
  const six = InstallmentOption.create({ months: 6, installment: pen(5_000) });

  it('pide los slots del círculo solo con su duración, y otro monto lo descarta', () => {
    const draft = JoinCircleDraft.forTarget(pen(30_000), { circleId: 'v-1', months: 10 });
    expect(draft.slotsCircleId()).toBeNull();
    expect(draft.withInstallment(ten).slotsCircleId()).toBe('v-1');
    expect(draft.withInstallment(six).slotsCircleId()).toBeNull();
    expect(draft.withPayoutAmount(pen(30_000)).withInstallment(ten).slotsCircleId()).toBe('v-1');
    expect(draft.withPayoutAmount(pen(40_000)).target).toBeNull();
  });
});

describe('Puesta al día', () => {
  it('un slot sin puesta al día la tiene en cero; una negativa o en otra moneda es inválida', () => {
    const base = {
      position: 7,
      payoutPeriod: '2027-05',
      type: 'lowestFees' as const,
      fee: pen(0),
      discount: pen(0),
      available: true,
    };
    expect(Slot.create(base).catchUp.equals(pen(0))).toBe(true);
    expect(() => Slot.create({ ...base, catchUp: Money.of(-1, 'PEN') })).toThrow(InvalidSlotError);
    expect(() => Slot.create({ ...base, catchUp: Money.of(1, 'USD') })).toThrow(InvalidSlotError);
  });

  it('la primera cuota de quien toma una vacante es la de su mes de ingreso', () => {
    const installments = [0, 0, 0, 0, 0, 12_300, 12_300, 3_000, 3_000, 3_000].map(pen);
    expect(firstInstallmentOf({ installments, startsOn: '2026-11' })).toEqual({
      amount: pen(12_300),
      period: '2027-04',
    });
    expect(firstInstallmentOf({ installments: [pen(0)], startsOn: '2026-11' })).toBeNull();
  });

  it('el adaptador HTTP envía el circleId y lee la puesta al día y las vacantes', async () => {
    const { fetchImpl, repository } = api({
      circleId: 'v-1',
      payout: money(3_000_000),
      months: 10,
      slots: [
        {
          position: 7,
          payoutPeriod: '2027-05',
          type: 'lowest_fees',
          fee: money(0),
          discount: money(0),
          catchUp: money(1_500_000),
          available: true,
        },
      ],
    });
    const [slot] = await repository.listSlots(pen(30_000), 10, undefined, 'v-1');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.test/v1/circles/slots?payoutAmount=3000000&months=10&circleId=v-1',
    );
    expect(slot?.catchUp.equals(pen(15_000))).toBe(true);

    const recommended = api({
      items: [
        {
          circleId: 'v-1',
          payout: money(3_000_000),
          months: 10,
          startsOn: '2026-11',
          endsOn: '2027-08',
          baseInstallment: money(300_000),
          adminFee: money(360_000),
          availableSlots: 1,
          vacancies: [{ position: 7, payoutPeriod: '2027-05' }],
        },
      ],
    });
    const [circle] = await recommended.repository.listRecommended();
    expect(circle?.vacancies).toEqual([{ position: 7, payoutPeriod: '2027-05' }]);
  });
});
