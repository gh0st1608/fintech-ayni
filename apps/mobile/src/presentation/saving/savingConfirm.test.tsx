import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { SavedCard } from '@/domain/payments/SavedCard';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { InMemoryCardRepository } from '@/infrastructure/payments/InMemoryCardRepository';
import { InMemorySavingPlanRepository } from '@/infrastructure/savings/InMemorySavingPlanRepository';
import { SavingPlanApiRepository } from '@/infrastructure/savings/SavingPlanApiRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { SavingConfirmScreen } from './screens/SavingConfirmScreen';

const NOW = new Date(2026, 9, 31);
const VISA: SavedCard = {
  id: 'card-1',
  brand: 'visa',
  lastFour: '4242',
  expirationMonth: 12,
  expirationYear: 2030,
  isDefault: true,
};

function setup(options: { cards?: SavedCard[]; rejectWith?: string } = {}) {
  const savings = new InMemorySavingPlanRepository({
    latencyMs: 0,
    currency: 'PEN',
    now: () => NOW,
  });
  savings.rejectWith = options.rejectWith ?? null;
  const cards = new InMemoryCardRepository({ latencyMs: 0, cards: options.cards ?? [VISA] });
  return { savings, setup: createTestContainer({ savings, cards }) };
}

const render = (container: ReturnType<typeof setup>['setup'], handlers = {}) =>
  renderWithProviders(
    <SavingConfirmScreen
      planId="lite"
      months={6}
      onAddCard={jest.fn()}
      onDone={jest.fn()}
      now={() => NOW}
      {...handlers}
    />,
    container,
  );

describe('SavingConfirmScreen (COPAYNI-79, D5)', () => {
  it('muestra el plan, cobra el primer aporte y confirma el próximo', async () => {
    const { savings, setup: container } = setup();
    const onDone = jest.fn();
    await render(container, { onDone });

    expect(await screen.findByTestId('saving-confirm-plan')).toHaveTextContent(
      /Ahorro Lite · 6 meses/,
    );
    const rows = screen.getByTestId('saving-confirm-rows');
    expect(rows).toHaveTextContent(/Aporte mensual.*500/);
    expect(rows).toHaveTextContent(/Cashback.*5 %.*150/);
    expect(rows).toHaveTextContent(/Fecha de cobro.*abr.*2027/i);
    expect(rows).toHaveTextContent(/Método.*VISA •••• 4242/);
    expect(screen.getByText(/recibes lo ahorrado sin cashback/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('saving-auto-debit'));
    await fireEvent.press(screen.getByTestId('saving-confirm-pay'));
    expect(await screen.findByTestId('saving-subscribed')).toHaveTextContent(/Ya estás ahorrando/);
    expect(screen.getByText(/próximo aporte de .*500.* vence el/)).toBeTruthy();
    const [subscription] = await savings.mine();
    expect(subscription).toMatchObject({ planId: 'lite', months: 6, autoDebit: false });

    await fireEvent.press(screen.getByRole('button', { name: 'Entendido' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('un cobro rechazado no suscribe y muestra el motivo; el reintento usa otra clave', async () => {
    const { savings, setup: container } = setup({ rejectWith: 'cc_rejected_insufficient_amount' });
    const subscribe = jest.spyOn(savings, 'subscribe');
    await render(container);

    await fireEvent.press(await screen.findByTestId('saving-confirm-pay'));
    expect(await screen.findByTestId('saving-confirm-error')).toBeTruthy();
    expect(screen.queryByTestId('saving-subscribed')).toBeNull();

    savings.rejectWith = null;
    await fireEvent.press(screen.getByTestId('saving-confirm-pay'));
    expect(await screen.findByTestId('saving-subscribed')).toBeTruthy();
    const keys = subscribe.mock.calls.map(([, key]) => key);
    expect(new Set(keys).size).toBe(2);
  });

  it('sin tarjeta guardada ofrece agregar una', async () => {
    const onAddCard = jest.fn();
    await render(setup({ cards: [] }).setup, { onAddCard });
    expect(await screen.findByTestId('saving-confirm-no-card')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar tarjeta' }));
    expect(onAddCard).toHaveBeenCalled();
  });
});

describe('SavingPlanApiRepository: suscripción', () => {
  it('envía la clave de idempotencia y mapea la suscripción', async () => {
    const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    fetchImpl.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 's-1',
            planId: 'gold',
            months: 12,
            status: 'active',
            target: { amount: 3_000_000, currency: 'PEN' },
            cashback: { amount: 300_000, currency: 'PEN' },
            saved: { amount: 250_000, currency: 'PEN' },
            paidContributions: 1,
            nextContribution: {
              sequence: 2,
              dueOn: '2027-01-15',
              amount: { amount: 250_000, currency: 'PEN' },
            },
            payoutPeriod: '2027-12',
            autoDebit: true,
            card: 'Visa •••• 4242',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const repository = new SavingPlanApiRepository(
      new FetchHttpClient({
        baseUrl: 'https://api.test/v1',
        timeoutMs: 1000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    const subscription = await repository.subscribe(
      { planId: 'gold', months: 12, cardId: 'card-1', autoDebit: true },
      'clave-0000000000000001',
    );
    expect(subscription).toMatchObject({ status: 'active', paidContributions: 1 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.test/v1/savings/subscriptions');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'clave-0000000000000001',
    );
    await waitFor(() =>
      expect(JSON.parse(init?.body as string)).toMatchObject({ autoDebit: true }),
    );
  });
});
