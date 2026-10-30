import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import type { SavedCard } from '@/domain/payments/SavedCard';
import { InMemoryCardRepository } from '@/infrastructure/payments/InMemoryCardRepository';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { AddCardScreen } from './screens/AddCardScreen';
import { PayInstallmentScreen } from './screens/PayInstallmentScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { SavedCardsScreen } from './screens/SavedCardsScreen';

const card = (overrides: Partial<SavedCard>): SavedCard => ({
  id: 'card-1',
  brand: 'visa',
  lastFour: '3704',
  expirationMonth: 11,
  expirationYear: 2030,
  isDefault: true,
  ...overrides,
});

/** Confirma el diálogo nativo pulsando el botón destructivo. */
function confirmAlerts() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    (buttons as AlertButton[] | undefined)
      ?.find(({ style }) => style === 'destructive')
      ?.onPress?.();
  });
}

describe('SavedCardsScreen (COPAYNI-39)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lista las tarjetas con la predeterminada primero y cambia la predeterminada', async () => {
    const cards = new InMemoryCardRepository({
      latencyMs: 0,
      cards: [
        card({}),
        card({ id: 'card-2', brand: 'master', lastFour: '0604', isDefault: false }),
      ],
    });
    await renderWithProviders(
      <SavedCardsScreen onAddCard={jest.fn()} />,
      createTestContainer({ cards }),
    );
    expect(await screen.findByTestId('card-card-1')).toHaveTextContent(
      /VISA •••• 3704.*Predeterminada.*Vence 11\/2030/,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Usar para cobros' }));
    await waitFor(() =>
      expect(screen.getByTestId('card-card-2')).toHaveTextContent(/Predeterminada/),
    );
  });

  it('no deja borrar la predeterminada si hay otras y explica qué hacer', async () => {
    confirmAlerts();
    const cards = new InMemoryCardRepository({
      latencyMs: 0,
      cards: [card({}), card({ id: 'card-2', lastFour: '0604', isDefault: false })],
    });
    await renderWithProviders(
      <SavedCardsScreen onAddCard={jest.fn()} />,
      createTestContainer({ cards }),
    );
    await screen.findByTestId('card-card-1');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Eliminar' })[0]!);

    expect(await screen.findByText(/Elige otra tarjeta para los cobros/)).toBeTruthy();
    expect(screen.getByTestId('card-card-1')).toBeTruthy();

    await fireEvent.press(screen.getAllByRole('button', { name: 'Eliminar' })[1]!);
    await waitFor(() => expect(screen.queryByTestId('card-card-2')).toBeNull());
  });

  it('sin tarjetas muestra el estado vacío y "Agregar tarjeta"', async () => {
    const onAddCard = jest.fn();
    await renderWithProviders(<SavedCardsScreen onAddCard={onAddCard} />);
    expect(await screen.findByTestId('cards-empty')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Agregar tarjeta' }));
    expect(onAddCard).toHaveBeenCalled();
  });
});

describe('AddCardScreen (COPAYNI-40)', () => {
  async function fill(number: string) {
    await fireEvent.changeText(screen.getByTestId('card-number'), number);
    await fireEvent.changeText(screen.getByTestId('card-holder'), 'ANA QUISPE');
    await fireEvent.changeText(screen.getByTestId('card-expiration'), '11/30');
    await fireEvent.changeText(screen.getByTestId('card-cvc'), '123');
    await fireEvent.changeText(screen.getByTestId('card-document'), '45678912');
  }

  it('valida los campos antes de ir a la pasarela', async () => {
    const setup = createTestContainer();
    const tokenize = jest.spyOn(setup.adapters.paymentTokenizer, 'tokenizeCard');
    await renderWithProviders(<AddCardScreen onAdded={jest.fn()} />, setup);
    await fireEvent.changeText(screen.getByTestId('card-number'), '4509 9535 6623 3705');
    await fireEvent.changeText(screen.getByTestId('card-expiration'), '13/30');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar tarjeta' }));

    expect(screen.getByText('Revisa el número de la tarjeta.')).toBeTruthy();
    expect(screen.getByText('Revisa el vencimiento (MM/AA).')).toBeTruthy();
    expect(screen.getByText('El código tiene 3 o 4 dígitos.')).toBeTruthy();
    expect(tokenize).not.toHaveBeenCalled();
  });

  it('tokeniza, guarda solo el token y vuelve', async () => {
    const setup = createTestContainer();
    const add = jest.spyOn(setup.adapters.cards, 'add');
    const onAdded = jest.fn();
    await renderWithProviders(<AddCardScreen onAdded={onAdded} />, setup);
    await fill('4509 9535 6623 3704');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar tarjeta' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    const [token, key] = add.mock.calls[0]!;
    expect(token).not.toMatch(/4509953566233704|123/);
    expect(key).toBe('key-1');
  });

  it('muestra el rechazo de la pasarela', async () => {
    await renderWithProviders(<AddCardScreen onAdded={jest.fn()} />);
    await fill('4000 0000 0000 0002');
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar tarjeta' }));
    expect(await screen.findByText(/La tarjeta fue rechazada/)).toBeTruthy();
  });
});

describe('Pagar una cuota (COPAYNI-63)', () => {
  const withDue = () =>
    new InMemoryPaymentRepository('PEN', { latencyMs: 0, withDuePayments: true });

  it('la cuota pendiente tiene "Pagar" en el resumen', async () => {
    const onPay = jest.fn();
    await renderWithProviders(
      <PaymentScreen onJoin={jest.fn()} onOpenHistory={jest.fn()} onPay={onPay} />,
      createTestContainer({ payments: withDue() }),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Pagar' }));
    expect(onPay).toHaveBeenCalledWith('i-1');
  });

  it('paga con Yape con el celular y el código, y confirma', async () => {
    const payments = withDue();
    await renderWithProviders(
      <PayInstallmentScreen installmentId="i-1" onAddCard={jest.fn()} onDone={jest.fn()} />,
      createTestContainer({ payments }),
    );
    expect(await screen.findByTestId('pay-amount')).toHaveTextContent(/5\.?600/);

    await fireEvent.press(screen.getByRole('button', { name: /^Pagar / }));
    expect(screen.getByText('Escribe los 9 dígitos de tu celular.')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('yape-phone'), '987654321');
    await fireEvent.changeText(screen.getByTestId('yape-otp'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: /^Pagar / }));
    expect(await screen.findByText('¡Listo! Tu cuota quedó pagada.')).toBeTruthy();
    expect(payments.paid.has('i-1')).toBe(true);
  });

  it('un código de Yape rechazado se explica y permite reintentar', async () => {
    await renderWithProviders(
      <PayInstallmentScreen installmentId="i-1" onAddCard={jest.fn()} onDone={jest.fn()} />,
      createTestContainer({ payments: withDue() }),
    );
    await fireEvent.changeText(await screen.findByTestId('yape-phone'), '987654321');
    await fireEvent.changeText(screen.getByTestId('yape-otp'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: /^Pagar / }));
    expect(await screen.findByText(/Yape rechazó el pago/)).toBeTruthy();
  });

  it('paga con una tarjeta guardada', async () => {
    const payments = withDue();
    const cards = new InMemoryCardRepository({ latencyMs: 0, cards: [card({})] });
    await renderWithProviders(
      <PayInstallmentScreen installmentId="i-1" onAddCard={jest.fn()} onDone={jest.fn()} />,
      createTestContainer({ payments, cards }),
    );
    await fireEvent.press(await screen.findByTestId('pay-card-card-1'));
    await fireEvent.press(screen.getByRole('button', { name: /^Pagar / }));
    expect(await screen.findByTestId('payment-result')).toBeTruthy();
  });

  it('una cuota que ya no está pendiente no se puede pagar', async () => {
    const onDone = jest.fn();
    await renderWithProviders(
      <PayInstallmentScreen installmentId="otra" onAddCard={jest.fn()} onDone={onDone} />,
      createTestContainer({ payments: withDue() }),
    );
    expect(await screen.findByText('Esta cuota ya no está pendiente.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onDone).toHaveBeenCalled();
  });
});
