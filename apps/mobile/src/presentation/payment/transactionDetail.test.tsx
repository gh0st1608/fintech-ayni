import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { PaymentHistoryScreen } from './screens/PaymentHistoryScreen';
import { TransactionDetailScreen } from './screens/TransactionDetailScreen';

const pen = (major: number) => Money.fromMajor(major, 'PEN');
const repository = () =>
  new InMemoryPaymentRepository('PEN', { latencyMs: 0, withDuePayments: true });

async function renderDetail(type: string, transactionId: string, payments = repository()) {
  const setup = createTestContainer({ payments });
  await renderWithProviders(
    <TransactionDetailScreen type={type} transactionId={transactionId} />,
    setup,
  );
  return setup;
}

describe('Detalle de un movimiento (D8, COPAYNI-78)', () => {
  it('un pago de cuota: monto en negativo, junta, turno, fecha y número de operación', async () => {
    await renderDetail('payment', 't-2');
    expect(await screen.findByTestId('transaction-amount')).toHaveTextContent(/^− .*5\.?600/);
    expect(screen.getByText('Cuota mensual')).toBeTruthy();
    const rows = screen.getByTestId('transaction-rows');
    expect(rows).toHaveTextContent(/Estado.*Completado/);
    expect(rows).toHaveTextContent(/Junta.*Junta de .*30\.?000/);
    expect(rows).toHaveTextContent(/Mes.*nov\.? 2026/i);
    expect(rows).toHaveTextContent(/Turno.*6/);
    expect(rows).not.toHaveTextContent(/Recibido/);
    expect(screen.getByText(/N\.º de operación\s+t-2/)).toBeTruthy();
  });

  it('un payout con retención muestra el pozo, lo descontado y lo recibido', async () => {
    const payments = repository();
    const real = await payments.getTransaction('payout', 't-3');
    jest.spyOn(payments, 'getTransaction').mockResolvedValue({
      ...real,
      amount: pen(24_000),
      deductions: pen(6_000),
    });
    await renderDetail('payout', 't-3', payments);
    expect(await screen.findByTestId('transaction-amount')).toHaveTextContent(/^\+ .*24\.?000/);
    const rows = screen.getByTestId('transaction-rows');
    expect(rows).toHaveTextContent(/Pozo.*30\.?000/);
    expect(rows).toHaveTextContent(/Retención y descuentos.*− .*6\.?000/);
    expect(rows).toHaveTextContent(/Recibido.*24\.?000/);
  });

  it('copia el número de operación', async () => {
    const setup = await renderDetail('payment', 't-2');
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Copiar el número de operación' }),
    );
    expect(await screen.findByText('Número de operación copiado.')).toBeTruthy();
    expect(setup.adapters.clipboard.text).toBe('t-2');
  });

  it('un movimiento ajeno muestra el error con reintento', async () => {
    const payments = repository();
    jest
      .spyOn(payments, 'getTransaction')
      .mockRejectedValue(new AppError('not_found', 'x', { code: 'TRANSACTION_NOT_FOUND' }));
    await renderDetail('payment', 'otro', payments);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('desde el historial, tocar un movimiento abre su detalle', async () => {
    const onOpenTransaction = jest.fn();
    await renderWithProviders(
      <PaymentHistoryScreen onExploreCircles={jest.fn()} onOpenTransaction={onOpenTransaction} />,
      createTestContainer({ payments: repository() }),
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: /Ver el detalle del movimiento de .*5\.?600/ }),
    );
    await waitFor(() => expect(onOpenTransaction).toHaveBeenCalledWith('payment', 't-2'));
  });
});
