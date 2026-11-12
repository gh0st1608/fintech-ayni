import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { SavedCard } from '@/domain/payments/SavedCard';
import { InMemoryCardRepository } from '@/infrastructure/payments/InMemoryCardRepository';
import { InMemorySavingPlanRepository } from '@/infrastructure/savings/InMemorySavingPlanRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { MySavingPlans } from './components/MySavingPlans';

const NOW = new Date(2026, 9, 31);
const VISA: SavedCard = {
  id: 'card-1',
  brand: 'visa',
  lastFour: '4242',
  expirationMonth: 12,
  expirationYear: 2030,
  isDefault: true,
};

async function setup(autoDebit: boolean) {
  const savings = new InMemorySavingPlanRepository({
    latencyMs: 0,
    currency: 'PEN',
    now: () => NOW,
  });
  const subscription = await savings.subscribe(
    { planId: 'lite', months: 6, cardId: 'card-1', autoDebit },
    'clave-de-alta-0001',
  );
  const cards = new InMemoryCardRepository({ latencyMs: 0, cards: [VISA] });
  return { savings, subscription, container: createTestContainer({ savings, cards }) };
}

describe('Mis planes de ahorro (COPAYNI-93)', () => {
  it('sin débito automático paga el aporte vencido y muestra el siguiente', async () => {
    const { container, subscription } = await setup(false);
    // El segundo aporte vence en noviembre: en diciembre ya está vencido.
    await renderWithProviders(<MySavingPlans now={() => new Date(2026, 11, 5)} />, container);

    const card = await screen.findByTestId(`saving-subscription-${subscription.id}`);
    expect(card).toHaveTextContent(/Ahorro Lite · 6 meses/);
    expect(card).toHaveTextContent(/1 de 6 aportes/);
    await fireEvent.press(screen.getByTestId(`saving-pay-${subscription.id}`));
    await waitFor(() =>
      expect(screen.getByTestId(`saving-subscription-${subscription.id}`)).toHaveTextContent(
        /2 de 6 aportes/,
      ),
    );
  });

  it('un aporte que no vence o con débito automático no ofrece pagar', async () => {
    const manual = await setup(false);
    await renderWithProviders(<MySavingPlans now={() => NOW} />, manual.container);
    expect(await screen.findByTestId(`saving-subscription-${manual.subscription.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`saving-pay-${manual.subscription.id}`)).toBeNull();

    const auto = await setup(true);
    await renderWithProviders(<MySavingPlans now={() => new Date(2026, 11, 5)} />, auto.container);
    expect(await screen.findByText(/se cobrará el/)).toBeTruthy();
    expect(screen.queryByTestId(`saving-pay-${auto.subscription.id}`)).toBeNull();
  });

  it('un cobro rechazado deja el aporte pendiente y muestra el motivo', async () => {
    const { container, subscription, savings } = await setup(false);
    savings.rejectWith = 'cc_rejected_insufficient_amount';
    await renderWithProviders(<MySavingPlans now={() => new Date(2026, 11, 5)} />, container);
    await fireEvent.press(await screen.findByTestId(`saving-pay-${subscription.id}`));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByTestId(`saving-subscription-${subscription.id}`)).toHaveTextContent(
      /1 de 6 aportes/,
    );
  });

  it('sin planes no muestra la sección', async () => {
    await renderWithProviders(<MySavingPlans />);
    await waitFor(() => expect(screen.queryByTestId('my-saving-plans')).toBeNull());
  });
});
