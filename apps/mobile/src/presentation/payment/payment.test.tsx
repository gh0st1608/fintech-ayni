import { fireEvent, screen } from '@testing-library/react-native';

import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { PaymentHistoryScreen } from './screens/PaymentHistoryScreen';
import { PaymentScreen } from './screens/PaymentScreen';

const pen = (major: number) => Money.fromMajor(major, 'PEN');

async function renderPayment(payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0 })) {
  const handlers = { onJoin: jest.fn(), onOpenHistory: jest.fn() };
  const view = await renderWithProviders(
    <PaymentScreen {...handlers} />,
    createTestContainer({ payments }),
  );
  return { ...view, ...handlers };
}

describe('PaymentScreen (COPAYNI-35)', () => {
  it('sin pagos pendientes muestra el estado vacío y "Unirme a un círculo" abre el flujo', async () => {
    const { onJoin } = await renderPayment();
    expect(await screen.findByText('Todavía no tienes pagos pendientes')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unirme a un círculo' }));
    expect(onJoin).toHaveBeenCalled();
  });

  it('con cuotas muestra el total, el próximo vencimiento y cada cuota', async () => {
    await renderPayment(
      new InMemoryPaymentRepository('PEN', { latencyMs: 0, withDuePayments: true }),
    );
    const due = await screen.findByTestId('payment-due');
    expect(due).toHaveTextContent(/Total por pagar/);
    expect(due).toHaveTextContent(/5\.?600/);
    expect(due).toHaveTextContent(/Próximo vencimiento: 5 dic\.? 2026/i);
    expect(screen.queryByTestId('payment-empty')).toBeNull();
  });

  it('muestra la deuda por impago y las cuotas en gracia', async () => {
    const payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0 });
    jest.spyOn(payments, 'getSummary').mockResolvedValue({
      hasDuePayments: true,
      totalDue: pen(5_600),
      nextDueOn: '2026-12-05',
      debt: pen(5_880),
      duePayments: [
        {
          installmentId: 'i-1',
          circleId: 'c-1',
          period: '2026-12',
          dueOn: '2026-12-05',
          amount: pen(5_600),
          status: 'overdue',
        },
      ],
    });
    await renderPayment(payments);
    expect(await screen.findByTestId('payment-debt')).toHaveTextContent(
      /Deuda por impago: .*5\.?880/,
    );
    expect(screen.getByText('En gracia')).toBeTruthy();
  });

  it('los accesos funcionan aunque falle el resumen; los que no tienen pantalla están deshabilitados', async () => {
    const payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0 });
    // Sin conexión: el resumen se reintenta solo y después muestra el error.
    const getSummary = jest
      .spyOn(payments, 'getSummary')
      .mockRejectedValue(new AppError('network', 'offline'));
    const { onOpenHistory } = await renderPayment(payments);

    expect(await screen.findByTestId('payment-summary-error', {}, { timeout: 8000 })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Historial de pagos' }));
    expect(onOpenHistory).toHaveBeenCalled();
    for (const label of ['Política de pagos', 'Ayuda', 'Elegibilidad del payout']) {
      expect(screen.getByRole('button', { name: `${label}, Próximamente` })).toBeDisabled();
    }

    getSummary.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('payment-empty')).toBeTruthy();
  }, 15_000);
});

describe('PaymentHistoryScreen (COPAYNI-41)', () => {
  async function renderHistory(payments: InMemoryPaymentRepository) {
    const onExploreCircles = jest.fn();
    await renderWithProviders(
      <PaymentHistoryScreen onExploreCircles={onExploreCircles} />,
      createTestContainer({ payments }),
    );
    return { onExploreCircles };
  }

  it('lista los pagos con monto y mes del círculo, y los cobros en su pestaña', async () => {
    await renderHistory(
      new InMemoryPaymentRepository('PEN', { latencyMs: 0, withDuePayments: true }),
    );
    const installment = await screen.findByTestId('transaction-t-2');
    expect(installment).toHaveTextContent(/Cuota mensual/);
    expect(installment).toHaveTextContent(/5\.?600/);
    expect(installment).toHaveTextContent(/Círculo de nov\.? 2026/i);
    expect(screen.getByTestId('transaction-t-1')).toHaveTextContent(/Deuda saldada/);

    await fireEvent.press(screen.getByRole('tab', { name: 'Cobros' }));
    expect(await screen.findByTestId('transaction-t-3')).toHaveTextContent(/Payout recibido/);
    expect(screen.queryByTestId('transaction-t-2')).toBeNull();
  });

  it('sin movimientos muestra el estado vacío con "Explorar círculos"', async () => {
    const { onExploreCircles } = await renderHistory(
      new InMemoryPaymentRepository('PEN', { latencyMs: 0 }),
    );
    expect(await screen.findByText('Todavía no tienes pagos.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Explorar círculos' }));
    expect(onExploreCircles).toHaveBeenCalled();
  });

  it('un error de carga se puede reintentar', async () => {
    const payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0, withDuePayments: true });
    const listTransactions = jest
      .spyOn(payments, 'listTransactions')
      .mockRejectedValue(new AppError('network', 'offline'));
    await renderHistory(payments);
    const retry = await screen.findByRole('button', { name: 'Reintentar' }, { timeout: 8000 });
    listTransactions.mockRestore();
    await fireEvent.press(retry);
    expect(await screen.findByTestId('transaction-t-2')).toBeTruthy();
  }, 15_000);
});
