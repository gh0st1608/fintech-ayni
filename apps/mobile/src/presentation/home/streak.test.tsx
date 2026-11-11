import { fireEvent, screen } from '@testing-library/react-native';

import { InMemoryCircleQuoteRepository } from '@/infrastructure/circles/InMemoryCircleQuoteRepository';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { HomeScreen } from './screens/HomeScreen';

async function renderHome(withDuePayments: boolean) {
  await renderWithProviders(
    <HomeScreen onJoinCircle={jest.fn()} onJoin={jest.fn()} />,
    createTestContainer({
      payments: new InMemoryPaymentRepository('PEN', { latencyMs: 0, withDuePayments }),
      circleQuote: new InMemoryCircleQuoteRepository({ latencyMs: 0 }),
    }),
  );
}

describe('Racha de pagos a tiempo en Home (D11, COPAYNI-82)', () => {
  it('el fuego muestra la racha y abre la hoja con los últimos meses', async () => {
    await renderHome(true);
    expect(await screen.findByTestId('streak-count')).toHaveTextContent('3');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Racha de 3 meses pagando a tiempo' }),
    );
    expect(await screen.findByText('¡Racha de 3 meses!')).toBeTruthy();
    expect(screen.getByText(/Pagar dentro de los días de gracia no la rompe/)).toBeTruthy();
    expect(screen.getByLabelText(/sept?\.? 2026: a tiempo/i)).toBeTruthy();
    expect(screen.getByLabelText(/dic\.? 2026: por pagar/i)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Entendido' }));
  });

  it('sin cuotas el fuego no muestra número y explica la racha', async () => {
    await renderHome(false);
    const button = await screen.findByRole('button', { name: 'Racha de pagos a tiempo' });
    expect(screen.queryByTestId('streak-count')).toBeNull();
    await fireEvent.press(button);
    expect(await screen.findByText('Tu racha de pagos')).toBeTruthy();
    expect(screen.queryByTestId('streak-months')).toBeNull();
  });
});
